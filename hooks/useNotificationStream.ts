'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type { NotificationItem } from '@/lib/notification-center/types'
import { useNotificationStreamContext } from '@/components/notification-center/NotificationStreamProvider'
import { startNotificationPolling } from '@/lib/notification-center/poll'

type StreamHandlers = {
  onCount?: (count: number) => void
  onNew?: (notification: NotificationItem) => void
}

/** Uses the shared poll when NotificationStreamProvider is mounted (the normal case —
 * one poll loop fans out to every consumer via context); otherwise polls on its own. */
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
    return startNotificationPolling(
      (n) => handlersRef.current.onCount?.(n),
      (n) => handlersRef.current.onNew?.(n),
    )
  }, [ctx])
}

type UnreadHandlers = {
  onNew?: (notification: NotificationItem) => void
  onCount?: (count: number) => void
}

/** Unread count synced via polling (single shared loop when provider present). */
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
