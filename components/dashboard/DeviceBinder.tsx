'use client'

import { useEffect } from 'react'
import { getDeviceKey } from '@/lib/client-device'
import { apiJson } from '@/lib/client-api'

/** ลงทะเบียนมือถือ 1 เครื่องต่อ user */
export default function DeviceBinder() {
  useEffect(() => {
    const key = getDeviceKey()
    apiJson('/api/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceKey: key, deviceLabel: navigator.userAgent.slice(0, 80) }),
    }).catch(() => {})
  }, [])
  return null
}
