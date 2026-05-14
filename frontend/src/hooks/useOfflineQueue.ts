import { useState, useEffect, useCallback } from 'react'
import { openDB } from 'idb'

interface QueuedRequest {
  id: string
  method: string
  url: string
  body?: any
  timestamp: number
}

export type ReconnectResult = 'online' | 'no-internet' | 'sw-reset' | 'server-down'

const DB_NAME = 'script-offline-queue'
const STORE_NAME = 'requests'

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)

  // Update count from DB
  const updateCount = useCallback(async () => {
    try {
      const db = await getDB()
      const count = await db.count(STORE_NAME)
      setPendingCount(count)
    } catch { /* ignore */ }
  }, [])

  // Add to queue
  const enqueue = useCallback(async (method: string, url: string, body?: any) => {
    const req: QueuedRequest = {
      id: `${Date.now()}-${Math.random()}`,
      method,
      url,
      body,
      timestamp: Date.now(),
    }
    try {
      const db = await getDB()
      await db.put(STORE_NAME, req)
      await updateCount()
    } catch { /* ignore */ }
  }, [updateCount])

  // Sync queued requests
  const syncQueue = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return
    setIsSyncing(true)
    try {
      const db = await getDB()
      const all = await db.getAll(STORE_NAME)
      for (const req of all) {
        try {
          await fetch(req.url, {
            method: req.method,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: req.body ? JSON.stringify(req.body) : undefined,
          })
          await db.delete(STORE_NAME, req.id)
        } catch { /* keep in queue */ }
      }
      await updateCount()
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, updateCount])

  useEffect(() => {
    updateCount()

    const handleOnline = () => {
      setIsOnline(true)
      syncQueue()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [updateCount, syncQueue])

  const reconnect = useCallback(async (): Promise<ReconnectResult> => {
    // Hinweis: navigator.onLine wird von Edge/Chrome auf false gesetzt wenn der SW in den
    // DevTools auf Offline gestellt wird — deshalb NICHT als erste Prüfung nutzen.
    // Stattdessen immer zuerst den Fetch versuchen.

    // 1. Server-Ping (cache: no-store umgeht HTTP-Cache, nicht aber den SW)
    let fetchOk = false
    try {
      const res = await fetch('/api/health', {
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      })
      fetchOk = res.ok || res.status < 500
    } catch { /* netzwerkfehler oder SW hat blockiert */ }

    if (fetchOk) {
      setIsOnline(true)
      syncQueue()
      return 'online'
    }

    // 2. Fetch fehlgeschlagen — SW prüfen
    //    navigator.onLine=false + SW vorhanden → klassischer DevTools-SW-Offline-Bug
    //    navigator.onLine=false + kein SW      → echtes Netzproblem
    //    navigator.onLine=true  + SW vorhanden → SW intercepted ohne offline-Flag (z.B. stuck)
    //    navigator.onLine=true  + kein SW      → Server down
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      if (regs.length > 0) {
        // SW ist präsent und Fetch ist fehlgeschlagen → SW deregistrieren, KEIN Reload.
        // Reload würde ERR_INTERNET_DISCONNECTED zeigen: Edge/Chrome setzen zusätzlich
        // zur SW-Offline-Flag auch navigator.onLine=false, was Reloads blockiert.
        // Nach Deregistrierung gehen alle Fetches direkt ans Netz (kein SW-Intercept mehr).
        // Sobald der Nutzer die DevTools-Offline-Checkbox deaktiviert, feuert der Browser
        // das 'online'-Event → isOnline wird automatisch true.
        await Promise.all(regs.map(r => r.unregister()))
        return 'sw-reset'
      }
    }

    // 3. Kein SW beteiligt → echter Offline oder Server down
    return navigator.onLine ? 'server-down' : 'no-internet'
  }, [syncQueue])

  return { isOnline, pendingCount, isSyncing, enqueue, syncQueue, reconnect }
}
