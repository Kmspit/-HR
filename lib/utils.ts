import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  BANGKOK_TZ,
  formatDateTimeBangkok,
  formatTimeBangkok,
  startOfTodayBangkok,
} from '@/lib/datetime-bangkok'

export { BANGKOK_TZ, startOfTodayBangkok } from '@/lib/datetime-bangkok'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatThaiDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: BANGKOK_TZ,
  })
}

export function formatThaiDateTime(date: Date | string): string {
  return formatDateTimeBangkok(date)
}

export function formatTime(date: Date | string): string {
  return formatTimeBangkok(date)
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

/** เริ่มวันนี้ 00:00 ตามเวลาไทย (UTC+7) */
export function startOfTodayLocal(): Date {
  return startOfTodayBangkok()
}

/** ช่วงวันที่เริ่ม–สิ้นเดือน (month 1–12) ตามเวลา local */
export function monthDateRange(month: number, year: number) {
  const start = new Date(year, month - 1, 1)
  start.setHours(0, 0, 0, 0)
  const end = new Date(year, month, 0)
  end.setHours(23, 59, 59, 999)
  return { start, end }
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

/** แปลงนาทีมาสายเป็น "0 ชั่วโมง 05 นาที" หรือ "1 ชั่วโมง 10 นาที" */
export function formatLateMinutes(minutes: number): string {
  if (minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h} ชั่วโมง ${String(m).padStart(2, '0')} นาที`
}

/** แปลงนาทีมาสายแบบย่อ สำหรับ UI คับแคบ: "15น" หรือ "1ช25น" */
export function formatLateMinutesShort(minutes: number): string {
  if (minutes <= 0) return '—'
  if (minutes < 60) return `${minutes}น`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}ช${m}น` : `${h}ช`
}
