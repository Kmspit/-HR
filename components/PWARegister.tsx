'use client'

import { useEffect } from 'react'

/** ลงทะเบียน service worker + ขอ background sync เมื่อกลับออนไลน์ */
export default function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('[PWA] sw register failed', err)
    })

    const scheduleSync = () => {
      navigator.serviceWorker.ready
        .then((reg) => {
          reg.active?.postMessage({ type: 'SCHEDULE_NOTIFICATION_SYNC' })
        })
        .catch(() => {})
    }

    window.addEventListener('online', scheduleSync)
    scheduleSync()

    return () => window.removeEventListener('online', scheduleSync)
  }, [])

  return null
}
