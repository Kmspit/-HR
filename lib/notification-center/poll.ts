import type { NotificationItem } from './types'

// Notifications used to ride the shared SSE connection (lib/announcement-events.ts,
// an in-process EventEmitter) — worked locally, but on Vercel the writer (whichever
// serverless invocation handled the action that created a notification) and this
// connection's listener are frequently different processes, so the emit silently
// never reaches an open tab. Confirmed live against production (round-12 audit): a
// notification created while a tab had an open SSE connection never arrived within
// 25s; the identical test against a single-process local server delivered it in ~6s.
// Polling has no such requirement — every poll is its own independent request/response,
// so it works the same regardless of which instance handled the write.
export const NOTIFICATION_POLL_INTERVAL_MS = 15_000

/** Shared by NotificationStreamProvider (the common case) and useNotificationStream's
 * standalone fallback (no provider in the tree) — one implementation so both paths
 * can't drift apart the way the two SSE-filtering copies did before. Returns a
 * cleanup function that stops polling. */
export function startNotificationPolling(
  onCount: (count: number) => void,
  onNew: (notification: NotificationItem) => void,
): () => void {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  // null until the first successful poll — seeds the "seen" set without firing
  // onNew for everything the initial page render already showed.
  let seenIds: Set<string> | null = null

  const poll = async () => {
    try {
      const res = await fetch('/api/notifications?limit=20', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json() as { notifications?: NotificationItem[]; unreadCount?: number }
        if (typeof data.unreadCount === 'number') onCount(data.unreadCount)
        if (Array.isArray(data.notifications)) {
          if (seenIds === null) {
            seenIds = new Set(data.notifications.map((n) => n.id))
          } else {
            for (const n of data.notifications) {
              if (!seenIds.has(n.id)) {
                seenIds.add(n.id)
                onNew(n)
              }
            }
          }
        }
      }
    } catch {
      // Network hiccup — just try again next interval.
    }
    if (!cancelled) timer = setTimeout(poll, NOTIFICATION_POLL_INTERVAL_MS)
  }

  poll()
  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
  }
}
