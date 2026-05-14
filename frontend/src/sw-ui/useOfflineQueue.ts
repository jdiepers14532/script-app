/**
 * useOfflineQueue — sw-ui shared hook
 *
 * Implementiert den Offline-Write-Schutz nach Local-First-Prinzip:
 * IndexedDB ist Source of Truth, Server ist eventually consistent.
 *
 * Tier 1: enqueue() bei Save-Fehler, automatischer Sync bei 'online'-Event
 * Tier 2: Exponential Backoff, Conflict Detection via 409 + client_version
 * Tier 3: Yjs-Persistence (in useCollaboration, nicht hier)
 *
 * Referenz: Kleppmann et al. (2019) "Local-first software" ACM SIGPLAN
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { openDB } from 'idb'

// ── Typen ────────────────────────────────────────────────────────────────────

export interface QueuedRequest {
  id: string
  method: string
  url: string
  body?: any
  timestamp: number
  attempts: number          // Anzahl fehlgeschlagener Sync-Versuche (für Backoff)
  client_version?: string   // ISO-Timestamp updated_at des Clients (Tier 2: Conflict Detection)
  status: 'pending' | 'conflict' | 'failed'
}

export interface SyncConflict {
  queueId: string
  url: string
  clientBody: any
  serverVersion: string     // updated_at vom Server
  clientVersion?: string    // updated_at das Client beim Enqueuen hatte
}

export type ReconnectResult = 'online' | 'no-internet' | 'sw-reset' | 'server-down'

// ── IndexedDB ────────────────────────────────────────────────────────────────

const DB_NAME = 'sw-offline-queue'
const STORE_NAME = 'requests'
const MAX_ATTEMPTS = 5
const MAX_BACKOFF_MS = 60_000

function backoffDelay(attempts: number): number {
  return Math.min(1000 * Math.pow(2, attempts), MAX_BACKOFF_MS)
}

async function getDB(dbName = DB_NAME) {
  return openDB(dbName, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    },
  })
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseOfflineQueueOptions {
  /** IndexedDB-Datenbankname — Standard: 'sw-offline-queue'. Pro App überschreiben! */
  dbName?: string
  /** Callback wenn Server 409 Conflict zurückgibt (Tier 2) */
  onConflict?: (conflict: SyncConflict) => void
  /** Callback nach erfolgreichem Sync einer URL — z.B. saveStatus updaten */
  onSyncSuccess?: (url: string) => void
}

export function useOfflineQueue(options: UseOfflineQueueOptions = {}) {
  const { dbName = DB_NAME, onConflict, onSyncSuccess } = options
  const [pendingCount, setPendingCount] = useState(0)
  const [conflictCount, setConflictCount] = useState(0)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const optionsRef = useRef({ onConflict, onSyncSuccess })
  optionsRef.current = { onConflict, onSyncSuccess }

  const updateCounts = useCallback(async () => {
    try {
      const db = await getDB(dbName)
      const all: QueuedRequest[] = await db.getAll(STORE_NAME)
      setPendingCount(all.filter(r => r.status === 'pending').length)
      setConflictCount(all.filter(r => r.status === 'conflict').length)
    } catch { /* ignore */ }
  }, [dbName])

  // ── enqueue: Schreibt fehlgeschlagene Anfrage in IndexedDB ────────────────
  const enqueue = useCallback(async (
    method: string,
    url: string,
    body?: any,
    client_version?: string,
  ) => {
    const req: QueuedRequest = {
      id: `${Date.now()}-${Math.random()}`,
      method,
      url,
      body,
      timestamp: Date.now(),
      attempts: 0,
      client_version,
      status: 'pending',
    }
    try {
      const db = await getDB(dbName)
      await db.put(STORE_NAME, req)
      await updateCounts()
    } catch { /* ignore */ }
  }, [dbName, updateCounts])

  // ── syncQueue: Verarbeitet alle pending Einträge ───────────────────────────
  const syncQueue = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return
    setIsSyncing(true)
    try {
      const db = await getDB(dbName)
      const all: QueuedRequest[] = await db.getAll(STORE_NAME)
      const pending = all.filter(r => r.status === 'pending')

      for (const req of pending) {
        // Exponential Backoff: erst nach Wartezeit erneut versuchen (Tier 2)
        const nextRetry = req.timestamp + backoffDelay(req.attempts)
        if (req.attempts > 0 && Date.now() < nextRetry) continue

        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          // Tier 2: client_version mitsenden für Conflict Detection
          if (req.client_version) headers['X-Client-Version'] = req.client_version

          const res = await fetch(req.url, {
            method: req.method,
            credentials: 'include',
            headers,
            body: req.body ? JSON.stringify(req.body) : undefined,
          })

          if (res.ok || res.status < 400) {
            // Erfolg → aus Queue löschen
            await db.delete(STORE_NAME, req.id)
            optionsRef.current.onSyncSuccess?.(req.url)
          } else if (res.status === 409) {
            // Tier 2: Conflict — markieren und Callback aufrufen
            const body = await res.json().catch(() => ({}))
            await db.put(STORE_NAME, { ...req, status: 'conflict' as const })
            optionsRef.current.onConflict?.({
              queueId: req.id,
              url: req.url,
              clientBody: req.body,
              serverVersion: body.server_version ?? '',
              clientVersion: req.client_version,
            })
          } else if (req.attempts + 1 >= MAX_ATTEMPTS) {
            // Zu viele Versuche → als failed markieren
            await db.put(STORE_NAME, { ...req, attempts: req.attempts + 1, status: 'failed' as const })
          } else {
            // Anderer Fehler → attempt hochzählen, Backoff
            await db.put(STORE_NAME, { ...req, attempts: req.attempts + 1 })
          }
        } catch {
          // Netzwerkfehler → attempt hochzählen
          await db.put(STORE_NAME, { ...req, attempts: req.attempts + 1 }).catch(() => {})
        }
      }
      await updateCounts()
    } finally {
      setIsSyncing(false)
    }
  }, [dbName, isSyncing, updateCounts])

  // ── resolveConflict: Konflikt auflösen (Tier 2) ──────────────────────────
  const resolveConflict = useCallback(async (
    queueId: string,
    resolution: 'force-push' | 'discard',
  ) => {
    try {
      const db = await getDB(dbName)
      const req: QueuedRequest | undefined = await db.get(STORE_NAME, queueId)
      if (!req) return
      if (resolution === 'force-push') {
        // Erneut versuchen ohne client_version (überschreibt Server-Stand)
        await db.put(STORE_NAME, { ...req, status: 'pending' as const, attempts: 0, client_version: undefined })
      } else {
        // Verwerfen
        await db.delete(STORE_NAME, queueId)
      }
      await updateCounts()
    } catch { /* ignore */ }
  }, [dbName, updateCounts])

  // ── reconnect: SW-Reset + Netzwerk-Diagnose ───────────────────────────────
  const reconnect = useCallback(async (): Promise<ReconnectResult> => {
    let fetchOk = false
    try {
      const res = await fetch('/api/health', {
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      })
      fetchOk = res.ok || res.status < 500
    } catch { /* netzwerkfehler */ }

    if (fetchOk) {
      setIsOnline(true)
      syncQueue()
      return 'online'
    }

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      if (regs.length > 0) {
        await Promise.all(regs.map(r => r.unregister()))
        return 'sw-reset'
      }
    }

    return navigator.onLine ? 'server-down' : 'no-internet'
  }, [syncQueue])

  // ── Event-Listener ────────────────────────────────────────────────────────
  useEffect(() => {
    updateCounts()
    const handleOnline = () => { setIsOnline(true); syncQueue() }
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [updateCounts, syncQueue])

  return {
    isOnline,
    pendingCount,
    conflictCount,
    isSyncing,
    enqueue,
    syncQueue,
    resolveConflict,
    reconnect,
  }
}
