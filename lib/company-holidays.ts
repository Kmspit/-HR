import type { HolidayType } from '@prisma/client'
import { HOLIDAY_TYPE_LABELS } from '@/lib/holiday-types'

export type HolidayRecord = {
  id: string
  holidayName: string
  holidayDate: Date
  holidayType: HolidayType
  repeatEveryYear: boolean
  branchId: string | null
}

/** วันที่ YYYY-MM-DD ตามเวลาไทย (UTC+7) */
export function toDateKey(d: Date): string {
  const t = new Date(d.getTime() + 7 * 60 * 60 * 1000)
  return t.toISOString().slice(0, 10)
}

export function parseDateOnly(iso: string): Date | null {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function monthDayKey(d: Date): string {
  const t = new Date(d.getTime() + 7 * 60 * 60 * 1000)
  return `${t.getUTCMonth() + 1}-${t.getUTCDate()}`
}

function appliesToBranch(holidayBranchId: string | null, userBranchId: string | null): boolean {
  if (holidayBranchId == null || holidayBranchId === '') return true
  return userBranchId != null && holidayBranchId === userBranchId
}

/** ตรวจว่าวันนี้เป็นวันหยุดสำหรับสาขานี้หรือไม่ */
export function isHolidayOnDate(day: Date, branchId: string | null, holidays: HolidayRecord[]): boolean {
  return getHolidayForDate(day, branchId, holidays) != null
}

export function getHolidayForDate(
  day: Date,
  branchId: string | null,
  holidays: HolidayRecord[],
): { id: string; name: string; type: HolidayType } | null {
  const dow = new Date(day.getTime() + 7 * 60 * 60 * 1000).getUTCDay()
  const dayKey = toDateKey(day)
  const md = monthDayKey(day)

  for (const h of holidays) {
    if (!appliesToBranch(h.branchId, branchId)) continue

    if (h.holidayType === 'SATURDAY') {
      if (h.repeatEveryYear && dow === 6) {
        return { id: h.id, name: h.holidayName, type: h.holidayType }
      }
      if (!h.repeatEveryYear && toDateKey(h.holidayDate) === dayKey && dow === 6) {
        return { id: h.id, name: h.holidayName, type: h.holidayType }
      }
    }
    if (h.holidayType === 'SUNDAY') {
      if (h.repeatEveryYear && dow === 0) {
        return { id: h.id, name: h.holidayName, type: h.holidayType }
      }
      if (!h.repeatEveryYear && toDateKey(h.holidayDate) === dayKey && dow === 0) {
        return { id: h.id, name: h.holidayName, type: h.holidayType }
      }
    }

    if (h.holidayType === 'PUBLIC_HOLIDAY' || h.holidayType === 'COMPANY_HOLIDAY') {
      const hKey = toDateKey(h.holidayDate)
      if (h.repeatEveryYear) {
        if (monthDayKey(h.holidayDate) === md) {
          return { id: h.id, name: h.holidayName, type: h.holidayType }
        }
      } else if (hKey === dayKey) {
        return { id: h.id, name: h.holidayName, type: h.holidayType }
      }
    }
  }
  return null
}

export type HolidayConflict = {
  date: string
  holidayName: string
  holidayType: HolidayType
  typeLabel: string
}

/** รายการวันหยุดที่ทับช่วงลา (รวมทุกวันในช่วง) */
export function findLeaveHolidayConflicts(
  startDate: Date,
  endDate: Date,
  branchId: string | null,
  holidays: HolidayRecord[],
): HolidayConflict[] {
  const out: HolidayConflict[] = []
  const seen = new Set<string>()
  const cur = new Date(startDate)
  cur.setUTCHours(12, 0, 0, 0)
  const end = new Date(endDate)
  end.setUTCHours(12, 0, 0, 0)

  while (cur <= end) {
    const hit = getHolidayForDate(cur, branchId, holidays)
    if (hit) {
      const key = toDateKey(cur)
      if (!seen.has(key)) {
        seen.add(key)
        out.push({
          date: key,
          holidayName: hit.name,
          holidayType: hit.type,
          typeLabel: HOLIDAY_TYPE_LABELS[hit.type],
        })
      }
    }
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

export function formatHolidayConflictMessage(conflicts: HolidayConflict[]): string {
  if (conflicts.length === 0) return ''
  const lines = conflicts.slice(0, 5).map((c) => `${c.date} (${c.typeLabel}: ${c.holidayName})`)
  const more = conflicts.length > 5 ? ` และอีก ${conflicts.length - 5} วัน` : ''
  return `ไม่สามารถลาในวันหยุดได้: ${lines.join(', ')}${more}`
}

export function validateHolidayInput(input: {
  holidayName: string
  holidayDate: string
  holidayType: HolidayType
  repeatEveryYear?: boolean
}): { ok: true; holidayDate: Date } | { ok: false; error: string } {
  const name = input.holidayName.trim()
  if (!name) return { ok: false, error: 'กรุณาระบุชื่อวันหยุด' }

  const d = parseDateOnly(input.holidayDate)
  if (!d) return { ok: false, error: 'วันที่ไม่ถูกต้อง' }

  if (input.holidayType === 'SATURDAY') {
    const dow = new Date(d.getTime() + 7 * 60 * 60 * 1000).getUTCDay()
    if (!input.repeatEveryYear && dow !== 6) {
      return { ok: false, error: 'วันเสาร์ — เลือกวันที่เป็นวันเสาร์ หรือเปิด "ซ้ำทุกปี"' }
    }
  }
  if (input.holidayType === 'SUNDAY') {
    const dow = new Date(d.getTime() + 7 * 60 * 60 * 1000).getUTCDay()
    if (!input.repeatEveryYear && dow !== 0) {
      return { ok: false, error: 'วันอาทิตย์ — เลือกวันที่เป็นวันอาทิตย์ หรือเปิด "ซ้ำทุกปี"' }
    }
  }

  return { ok: true, holidayDate: d }
}

export type CalendarHolidayCell = {
  dateKey: string
  id: string
  holidayName: string
  holidayType: HolidayType
  typeLabel: string
}

/** แผนที่วันหยุดในเดือนที่เลือก (สำหรับปฏิทิน) */
export function buildHolidayMapForMonth(
  year: number,
  month: number,
  branchId: string | null,
  holidays: HolidayRecord[],
): Record<string, CalendarHolidayCell> {
  const map: Record<string, CalendarHolidayCell> = {}
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0))
    const hit = getHolidayForDate(d, branchId, holidays)
    if (hit) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      map[dateKey] = {
        dateKey,
        id: hit.id,
        holidayName: hit.name,
        holidayType: hit.type,
        typeLabel: HOLIDAY_TYPE_LABELS[hit.type],
      }
    }
  }
  return map
}

/** โหลดกฎวันหยุดที่ใช้กับสาขา (รวมทุกสาขา) */
export async function loadHolidaysForBranch(
  prisma: {
    companyHoliday: {
      findMany: (args: object) => Promise<HolidayRecord[]>
    }
  },
  branchId: string | null,
) {
  return prisma.companyHoliday.findMany({
    where: {
      OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
    },
    orderBy: [{ holidayDate: 'asc' }],
    select: {
      id: true,
      holidayName: true,
      holidayDate: true,
      holidayType: true,
      repeatEveryYear: true,
      branchId: true,
    },
  })
}
