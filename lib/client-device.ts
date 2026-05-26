const STORAGE_KEY = 'hrflow_device_id'

export function getDeviceKey(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = `dev_${crypto.randomUUID()}`
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}

export function deviceHeaders(): HeadersInit {
  return { 'X-Device-Key': getDeviceKey() }
}
