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

/**
 * แปลงค่าจาก <input type="datetime-local"> (naive string ไม่มี timezone เช่น
 * "2026-07-18T09:00" หรือ "2026-07-18T09:00:00") เป็น Date ที่ถูกต้องจริง โดย
 * สมมติว่าค่าที่กรอกคือเวลาไทยเสมอ (ระบบนี้ใช้งานในไทยเท่านั้น) — ต้องใช้ก่อนส่งค่า
 * ไปให้ server เพราะถ้าปล่อยให้ server ทำ new Date(naiveString) ตรงๆ, Vercel
 * serverless รันเป็น UTC โดย default ทำให้ "09:00" ที่กรอกในกรุงเทพฯ (ควรเป็น
 * 02:00 UTC) ถูกตีความเป็น 09:00 UTC = 16:00 เวลาไทยจริง (เพี้ยนไป 7 ชั่วโมง)
 */
export function bangkokLocalInputToDate(naiveLocal: string): Date | null {
  if (!naiveLocal) return null
  const withSeconds = naiveLocal.length === 16 ? `${naiveLocal}:00` : naiveLocal
  const d = new Date(`${withSeconds}+07:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** เหมือน bangkokLocalInputToDate แต่คืนเป็น ISO string (UTC) พร้อมส่งผ่าน JSON —
 *  ใช้ตอนสร้าง request body ไปยัง API แทนการส่ง naive string ตรงๆ */
export function bangkokLocalInputToIso(naiveLocal: string): string | null {
  const d = bangkokLocalInputToDate(naiveLocal)
  return d ? d.toISOString() : null
}

/**
 * ช่วงเวลาของ "วันนี้ + N วัน" ตามปฏิทินไทย (00:00:00.000 ถึง 23:59:59.999 เวลาไทย)
 * — ใช้แทน `new Date(now.getFullYear(), now.getMonth(), now.getDate() + N)` ที่เป็น
 * server-local time (UTC บน Vercel) ไม่ใช่เวลาไทย ทำให้ช่วงเที่ยงคืน–ตี 7 เวลาไทย
 * "วันนี้"/"อีก N วัน" คำนวณผิดไปหนึ่งวัน
 */
export function bangkokDayRange(daysAhead: number = 0): { start: Date; end: Date } {
  const start = new Date(startOfTodayBangkok().getTime() + daysAhead * 86_400_000)
  const end = new Date(start.getTime() + 86_400_000 - 1)
  return { start, end }
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
