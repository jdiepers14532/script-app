import { useEffect, useRef, useState, useCallback } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

export type CollabStatus = 'connecting' | 'connected' | 'disconnected' | 'offline'

export interface CollabUser {
  user_id: string
  user_name: string
  color: string
  clientId: number
}

const USER_COLORS = [
  '#007AFF', '#FF9500', '#AF52DE', '#00C853',
  '#FF3B30', '#5AC8FA', '#FF2D55', '#FFCC00',
]

function colorForId(clientId: number): string {
  return USER_COLORS[clientId % USER_COLORS.length]
}

interface UseCollaborationOptions {
  fassungId: string | null
  enabled: boolean
}

export function useCollaboration({ fassungId, enabled }: UseCollaborationOptions) {
  const providerRef = useRef<HocuspocusProvider | null>(null)
  const ydocRef = useRef<Y.Doc | null>(null)
  const [status, setStatus] = useState<CollabStatus>('disconnected')
  const [users, setUsers] = useState<CollabUser[]>([])

  const destroy = useCallback(() => {
    providerRef.current?.destroy()
    providerRef.current = null
    ydocRef.current = null
    setStatus('disconnected')
    setUsers([])
  }, [])

  useEffect(() => {
    if (!fassungId || !enabled) {
      destroy()
      return
    }

    // Get JWT token from cookie
    const token = document.cookie
      .split('; ')
      .find(row => row.startsWith('access_token='))
      ?.split('=')[1] ?? ''

    const isSecure = window.location.protocol === 'https:'
    const wsProtocol = isSecure ? 'wss' : 'ws'
    const wsUrl = `${wsProtocol}://${window.location.host}/ws/collab`

    const ydoc = new Y.Doc()
    ydocRef.current = ydoc

    const provider = new HocuspocusProvider({
      url: wsUrl,
      name: `fassung-${fassungId}`,
      document: ydoc,
      token,
      onStatus({ status: s }) {
        if (s === 'connected') setStatus('connected')
        else if (s === 'connecting') setStatus('connecting')
        else setStatus('disconnected')
      },
      onDisconnect() {
        if (!navigator.onLine) setStatus('offline')
        else setStatus('disconnected')
      },
      onAwarenessChange({ states }) {
        const activeUsers: CollabUser[] = []
        states.forEach((state, clientId) => {
          if (state?.user) {
            activeUsers.push({
              user_id: state.user.user_id ?? String(clientId),
              user_name: state.user.user_name ?? 'Unbekannt',
              color: state.user.color ?? colorForId(clientId),
              clientId,
            })
          }
        })
        setUsers(activeUsers)
      },
    })

    // Set local user awareness
    provider.setAwarenessField('user', {
      user_id: 'me',
      user_name: 'Ich',
      color: colorForId(provider.document.clientID),
    })

    providerRef.current = provider

    // Offline detection
    const handleOffline = () => setStatus('offline')
    const handleOnline = () => {
      if (providerRef.current?.isConnected) setStatus('connected')
      else setStatus('connecting')
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      destroy()
    }
  }, [fassungId, enabled, destroy])

  return {
    ydoc: ydocRef.current,
    provider: providerRef.current,
    status,
    users,
  }
}
