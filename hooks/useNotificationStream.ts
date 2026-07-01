'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type { NotificationItem } from '@/lib/notification-center/types'
import { useNotificationStreamContext } from '@/components/notification-center/NotificationStreamProvider'

type StreamHandlers = {
  onCount?: (count: number) => void
  onNew?: (notification: NotificationItem) => void
}

const BASE_RETRY_MS = 8_000
const MAX_RETRY_MS = 60_000

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Uses shared SSE when NotificationStreamProvider is mounted; otherwise opens its own connection. */
export function useNotificationStream(handlers: StreamHandlers) {
  const ctx = useNotificationStreamContext()
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (ctx) {
      return ctx.subscribe({
        onCount: (n) => handlersRef.current.onCount?.(n),
        onNew: (n) => handlersRef.current.onNew?.(n),
      })
    }

    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryMs = BASE_RETRY_MS
    let cancelled = false

    const connect = () => {
      if (cancelled) return
      es = new EventSource('/api/announcements/sse')
      es.addEventListener('open', () => {
        retryMs = BASE_RETRY_MS
      })
      es.addEventListener('notification', (e) => {
        const data = safeParse<{ count: number }>(e.data)
        if (data && typeof data.count === 'number') handlersRef.current.onCount?.(data.count)
      })
      es.addEventListener('new-notification', (e) => {
        const data = safeParse<{ notification: NotificationItem }>(e.data)
        if (data?.notification) handlersRef.current.onNew?.(data.notification)
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
  }, [ctx])
}

type UnreadHandlers = {
  onNew?: (notification: NotificationItem) => void
  onCount?: (count: number) => void
}

/** Unread count synced via SSE (single connection when provider present). */
export function useUnreadCount(initial: number, handlers?: UnreadHandlers) {
  const [count, setCount] = useState(initial)

  const handleCount = useCallback((n: number) => {
    setCount(n)
    handlers?.onCount?.(n)
  }, [handlers])

  useNotificationStream({
    onCount: handleCount,
    onNew: handlers?.onNew,
  })

  return [count, setCount] as const
}
