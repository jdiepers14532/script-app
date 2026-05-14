/**
 * OfflineQueueContext — sw-ui shared context
 *
 * Stellt useOfflineQueue als React-Kontext bereit, damit alle Komponenten
 * einer App (AppShell, EditorPanel etc.) dieselbe Queue-Instanz verwenden.
 *
 * Usage:
 *   // App.tsx
 *   <OfflineQueueProvider dbName="my-app-queue" onConflict={handleConflict}>
 *     <App />
 *   </OfflineQueueProvider>
 *
 *   // Jede Komponente
 *   const { isOnline, enqueue, pendingCount } = useOfflineQueueContext()
 */
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useOfflineQueue } from './useOfflineQueue'
import type { UseOfflineQueueOptions, SyncConflict, ReconnectResult } from './useOfflineQueue'

export type { SyncConflict, ReconnectResult }

// ── Context-Typ ───────────────────────────────────────────────────────────────

interface OfflineQueueContextValue {
  isOnline: boolean
  pendingCount: number
  conflictCount: number
  isSyncing: boolean
  enqueue: (method: string, url: string, body?: any, client_version?: string) => Promise<void>
  syncQueue: () => Promise<void>
  resolveConflict: (queueId: string, resolution: 'force-push' | 'discard') => Promise<void>
  reconnect: () => Promise<ReconnectResult>
}

const OfflineQueueContext = createContext<OfflineQueueContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

export interface OfflineQueueProviderProps extends UseOfflineQueueOptions {
  children: ReactNode
}

export function OfflineQueueProvider({ children, ...options }: OfflineQueueProviderProps) {
  const value = useOfflineQueue(options)
  return (
    <OfflineQueueContext.Provider value={value}>
      {children}
    </OfflineQueueContext.Provider>
  )
}

// ── Consumer Hook ─────────────────────────────────────────────────────────────

export function useOfflineQueueContext(): OfflineQueueContextValue {
  const ctx = useContext(OfflineQueueContext)
  if (!ctx) throw new Error('useOfflineQueueContext must be used within OfflineQueueProvider')
  return ctx
}
