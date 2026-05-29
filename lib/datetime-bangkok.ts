/** เวลาไทย — UTC+7 (Asia/Bangkok, ไม่มี DST) */
export const BANGKOK_TZ = 'Asia/Bangkok'

const thTimeOpts: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: BANGKOK_TZ,
}

const thDateShortOpts: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: BANGKOK_TZ,
}

/** YYYY-MM-DD ตามปฏิทินกรุงเทพ */
export function bangkokDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** 00:00:00 ของวันนี้ตามเวลาไทย (ใช้เป็น attendance.date) */
export function startOfTodayBangkok(): Date {
  return new Date(`${bangkokDateKey()}T00:00:00+07:00`)
}

export function formatTimeBangkok(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('th-TH', thTimeOpts)
}

export function formatDateBangkok(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('th-TH', thDateShortOpts)
}

/** dd/MM/yyyy สำหรับ LINE / รายงาน */
export function formatDateDdMmYyyyBangkok(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BANGKOK_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d)
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026'
  return `${day}/${month}/${year}`
}

export function formatDateTimeBangkok(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('th-TH', {
    timeZone: BANGKOK_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
