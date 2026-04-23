import { useState, useEffect, useCallback } from 'react'
import { openDB } from 'idb'

interface QueuedRequest {
  id: string
  method: string
  url: string
  body?: any
  timestamp: number
}

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

  return { isOnline, pendingCount, isSyncing, enqueue, syncQueue }
}
