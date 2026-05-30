/** บันทึกประวัติสแกนลงเวลาบนเครื่องมือถือ (localStorage) */

export type LocalAttendanceEvent =
  | 'checkin'
  | 'checkout'
  | 'lunch-out'
  | 'lunch-in'

export type LocalAttendanceLogEntry = {
  id: string
  userId: string
  employeeName: string
  employeeCode: string | null
  event: LocalAttendanceEvent
  eventLabel: string
  scannedAt: string
  year: number
  month: number
  workPlaceName: string | null
  address: string | null
  lat: number | null
  lng: number | null
  photoThumb: string | null
  serverAttendanceId: string | null
  faceScanId: string | null
  lineSent: boolean
  lineFailed: number
  syncedAt: string
}

const STORAGE_KEY = 'hrflow_attendance_local_v1'
const MAX_ENTRIES = 80

const EVENT_LABEL: Record<LocalAttendanceEvent, string> = {
  checkin: 'เช็คอิน',
  checkout: 'เช็คเอาท์',
  'lunch-out': 'เริ่มพักกลางวัน',
  'lunch-in': 'กลับจากพัก',
}

export function localAttendanceEventLabel(event: LocalAttendanceEvent): string {
  return EVENT_LABEL[event] ?? event
}

function readAll(): LocalAttendanceLogEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LocalAttendanceLogEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(entries: LocalAttendanceLogEntry[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
}

/** ย่อรูปก่อนเก็บในเครื่อง (ลดขนาด localStorage) */
export async function compressPhotoForLocalStorage(
  dataUrl: string,
  maxWidth = 360,
): Promise<string | null> {
  if (!dataUrl?.startsWith('data:image')) return null
  if (typeof document === 'undefined') return dataUrl

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / (img.width || maxWidth))
      const w = Math.max(1, Math.round((img.width || maxWidth) * scale))
      const h = Math.max(1, Math.round((img.height || maxWidth) * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.52))
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

export type SaveLocalAttendanceInput = {
  userId: string
  employeeName: string
  employeeCode?: string | null
  event: LocalAttendanceEvent
  scannedAt?: Date
  workPlaceName?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  photoDataUrl?: string | null
  serverAttendanceId?: string | null
  faceScanId?: string | null
  lineNotify?: { sent?: number; failed?: number }
}

export async function saveAttendanceToLocalDevice(
  input: SaveLocalAttendanceInput,
): Promise<LocalAttendanceLogEntry> {
  const at = input.scannedAt ?? new Date()
  const bangkok = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(at)
  const year = Number(bangkok.find((p) => p.type === 'year')?.value ?? at.getFullYear())
  const month = Number(bangkok.find((p) => p.type === 'month')?.value ?? at.getMonth() + 1)

  let photoThumb: string | null = null
  if (input.photoDataUrl) {
    photoThumb = await compressPhotoForLocalStorage(input.photoDataUrl)
  }

  const entry: LocalAttendanceLogEntry = {
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    userId: input.userId,
    employeeName: input.employeeName,
    employeeCode: input.employeeCode ?? null,
    event: input.event,
    eventLabel: localAttendanceEventLabel(input.event),
    scannedAt: at.toISOString(),
    year,
    month,
    workPlaceName: input.workPlaceName ?? null,
    address: input.address ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    photoThumb,
    serverAttendanceId: input.serverAttendanceId ?? null,
    faceScanId: input.faceScanId ?? null,
    lineSent: (input.lineNotify?.sent ?? 0) > 0,
    lineFailed: input.lineNotify?.failed ?? 0,
    syncedAt: new Date().toISOString(),
  }

  const list = readAll()
  list.unshift(entry)
  writeAll(list)
  return entry
}

/** เรียง ชื่อ-นามสกุล → ปี → เดือน → เวลาล่าสุด */
export function sortLocalAttendanceLogs(
  entries: LocalAttendanceLogEntry[],
): LocalAttendanceLogEntry[] {
  return [...entries].sort((a, b) => {
    const byName = a.employeeName.localeCompare(b.employeeName, 'th')
    if (byName !== 0) return byName
    if (a.year !== b.year) return b.year - a.year
    if (a.month !== b.month) return b.month - a.month
    return new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
  })
}

export function listLocalAttendanceLogs(options?: {
  userId?: string
  month?: number
  year?: number
}): LocalAttendanceLogEntry[] {
  let list = readAll()
  if (options?.userId) list = list.filter((e) => e.userId === options.userId)
  if (options?.month) list = list.filter((e) => e.month === options.month)
  if (options?.year) list = list.filter((e) => e.year === options.year)
  return sortLocalAttendanceLogs(list)
}

export function clearLocalAttendanceLogs(userId?: string) {
  if (!userId) {
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
    return
  }
  writeAll(readAll().filter((e) => e.userId !== userId))
}
