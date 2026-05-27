/** 1=จันทร์ … 7=อาทิตย์ (ตรงกับแผนสัปดาห์ Mon–Sun) */
export const WEEKLY_PLAN_DAYS = [
  { id: 1, label: 'วันจันทร์' },
  { id: 2, label: 'วันอังคาร' },
  { id: 3, label: 'วันพุธ' },
  { id: 4, label: 'วันพฤหัสบดี' },
  { id: 5, label: 'วันศุกร์' },
  { id: 6, label: 'วันเสาร์' },
  { id: 7, label: 'วันอาทิตย์' },
] as const

export const WEEKLY_DAY_LABELS = [
  '',
  'จันทร์',
  'อังคาร',
  'พุธ',
  'พฤหัสฯ',
  'ศุกร์',
  'เสาร์',
  'อาทิตย์',
] as const

export function weeklyDayLabel(dayOfWeek: number): string {
  return WEEKLY_DAY_LABELS[dayOfWeek] ?? `วัน ${dayOfWeek}`
}

export function dateForPlanDay(weekStart: Date | string, dayOfWeek: number): Date {
  const start = new Date(weekStart)
  const d = new Date(start)
  d.setDate(start.getDate() + (dayOfWeek - 1))
  return d
}
