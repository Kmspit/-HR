import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatThaiDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatThaiDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

/** Convert canvas data URL to Blob without fetch (works in all browsers) */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = header?.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const binary = atob(base64 ?? '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function startOfTodayLocal(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function parseCoord(value: FormDataEntryValue | null): number | null {
  if (value == null || value === '') return null
  const n = parseFloat(String(value))
  return Number.isFinite(n) ? n : null
}

export function generateEmployeeId(): string {
  const year = new Date().getFullYear().toString().slice(-2)
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `EMP${year}${rand}`
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  const masked = local.slice(0, 2) + '***'
  return `${masked}@${domain}`
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
