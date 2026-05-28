import type { HolidayType } from '@prisma/client'

export const HOLIDAY_TYPE_OPTIONS: { value: HolidayType; label: string; desc: string }[] = [
  { value: 'SATURDAY', label: 'วันเสาร์', desc: 'หยุดทุกวันเสาร์ (ตามสาขา)' },
  { value: 'SUNDAY', label: 'วันอาทิตย์', desc: 'หยุดทุกวันอาทิตย์ (ตามสาขา)' },
  { value: 'PUBLIC_HOLIDAY', label: 'วันหยุดนักขัตฤกษ์', desc: 'วันที่กำหนด เช่น ปีใหม่' },
  { value: 'COMPANY_HOLIDAY', label: 'วันหยุดบริษัท', desc: 'วันหยุดพิเศษของบริษัท' },
]

export const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  SATURDAY: 'วันเสาร์',
  SUNDAY: 'วันอาทิตย์',
  PUBLIC_HOLIDAY: 'วันหยุดนักขัตฤกษ์',
  COMPANY_HOLIDAY: 'วันหยุดบริษัท',
}
