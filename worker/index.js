/** Custom service worker — รวมกับ Workbox จาก next-pwa ตอน build เป็น public/sw.js */

const NOTIFICATION_SYNC_TAG = 'sync-notifications'

self.addEventListener('sync', (event) => {
  if (event.tag === NOTIFICATION_SYNC_TAG) {
    event.waitUntil(syncNotifications())
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SCHEDULE_NOTIFICATION_SYNC' && 'sync' in self.registration) {
    event.waitUntil(
      self.registration.sync.register(NOTIFICATION_SYNC_TAG).catch(() => {
        /* Background Sync API ไม่รองรับบนทุก browser */
      }),
    )
  }
})

async function syncNotifications() {
  try {
    const res = await fetch('/api/notifications?limit=1', {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!res.ok) return

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      client.postMessage({ type: 'NOTIFICATIONS_SYNCED' })
    }
  } catch {
    /* ออฟไลน์ — รอ sync ครั้งถัดไป */
  }
}
