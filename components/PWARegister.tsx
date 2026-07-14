'use client'

import { useEffect } from 'react'

/** ลงทะเบียน service worker + ขอ background sync เมื่อกลับออนไลน์ */
export default function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return
    if (!('serviceWorker' in navigator)) return

    // updateViaCache:'none' — iOS Safari is slow to notice a new sw.js otherwise;
    // this forces every register() call to bypass HTTP cache when checking for updates.
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch((err) => {
      console.warn('[PWA] sw register failed', err)
    })

    // Reload once the new SW takes control (skipWaiting activates it, but the
    // already-open page keeps running under the old one until this fires) —
    // guarded so a controllerchange storm can't cause a reload loop.
    let reloaded = false
    const onControllerChange = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const scheduleSync = () => {
      navigator.serviceWorker.ready
        .then((reg) => {
          reg.active?.postMessage({ type: 'SCHEDULE_NOTIFICATION_SYNC' })
        })
        .catch(() => {})
    }

    window.addEventListener('online', scheduleSync)
    scheduleSync()

    return () => {
      window.removeEventListener('online', scheduleSync)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  return null
}
