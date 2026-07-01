'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type { NotificationItem } from '@/lib/notification-center/types'

type StreamHandlers = {
  onCount?: (count: number) => void
  onNew?: (notification: NotificationItem) => void
}

export function useNotificationStream(handlers: StreamHandlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const stableOnCount = useCallback((count: number) => {
    handlersRef.current.onCount?.(count)
  }, [])

  const stableOnNew = useCallback((notification: NotificationItem) => {
    handlersRef.current.onNew?.(notification)
  }, [])

  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      es = new EventSource('/api/announcements/sse')
      es.addEventListener('notification', (e) => {
        const data = JSON.parse(e.data) as { count: number }
        stableOnCount(data.count)
      })
      es.addEventListener('new-notification', (e) => {
        const data = JSON.parse(e.data) as { notification: NotificationItem }
        if (data.notification) stableOnNew(data.notification)
      })
      es.onerror = () => {
        es?.close()
        retryTimer = setTimeout(connect, 8000)
      }
    }

    connect()
    return () => {
      es?.close()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [stableOnCount, stableOnNew])
}

/** Unread count synced via SSE. */
export function useUnreadCount(initial: number) {
  const [count, setCount] = useState(initial)
  useNotificationStream({ onCount: setCount })
  return [count, setCount] as const
}
