'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import type { NotificationItem } from '@/lib/notification-center/types'

type Listener = {
  onCount?: (count: number) => void
  onNew?: (notification: NotificationItem) => void
}

type StreamContextValue = {
  subscribe: (listener: Listener) => () => void
}

const NotificationStreamContext = createContext<StreamContextValue | null>(null)

const BASE_RETRY_MS = 8_000
const MAX_RETRY_MS = 60_000

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function NotificationStreamProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef(new Set<Listener>())

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryMs = BASE_RETRY_MS
    let cancelled = false

    const emitCount = (count: number) => {
      for (const l of listenersRef.current) l.onCount?.(count)
    }

    const emitNew = (notification: NotificationItem) => {
      for (const l of listenersRef.current) l.onNew?.(notification)
    }

    const connect = () => {
      if (cancelled) return
      es = new EventSource('/api/announcements/sse')
      es.addEventListener('open', () => {
        retryMs = BASE_RETRY_MS
      })
      es.addEventListener('notification', (e) => {
        const data = safeParse<{ count: number }>((e as MessageEvent).data)
        if (data && typeof data.count === 'number') emitCount(data.count)
      })
      es.addEventListener('new-notification', (e) => {
        const data = safeParse<{ notification: NotificationItem }>((e as MessageEvent).data)
        if (data?.notification) emitNew(data.notification)
      })
      es.onerror = () => {
        es?.close()
        if (cancelled) return
        retryTimer = setTimeout(connect, retryMs)
        retryMs = Math.min(Math.round(retryMs * 1.5), MAX_RETRY_MS)
      }
    }

    connect()
    return () => {
      cancelled = true
      es?.close()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  const value = useMemo(() => ({ subscribe }), [subscribe])

  return (
    <NotificationStreamContext.Provider value={value}>
      {children}
    </NotificationStreamContext.Provider>
  )
}

export function useNotificationStreamContext() {
  return useContext(NotificationStreamContext)
}
