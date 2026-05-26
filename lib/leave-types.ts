export const LEAVE_TYPE_OPTIONS = [
  { value: 'SICK', label: '🤒 ลาป่วย', paid: true },
  { value: 'VACATION', label: '🏖️ ลาพักร้อน', paid: true },
  { value: 'PERSONAL', label: '🗓️ ลากิจ (ได้รับค่าจ้าง)', paid: true },
  { value: 'UNPAID', label: '💸 ลากิจ-ไม่ได้รับค่าจ้าง', paid: false },
  { value: 'FUNERAL', label: '⚱️ ลาพิธีศพ', paid: true },
  { value: 'WEDDING', label: '💒 ลาแต่งงาน', paid: true },
  { value: 'MATERNITY', label: '👶 ลาคลอด', paid: true },
  { value: 'ORDINATION', label: '🙏 ลาบวช', paid: true },
  { value: 'SPECIAL_HOLIDAY', label: '🎉 วันหยุดพิเศษ', paid: true },
] as const

export const LEAVE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  LEAVE_TYPE_OPTIONS.map((o) => [o.value, o.label]),
)

export type LeaveTypeValue = (typeof LEAVE_TYPE_OPTIONS)[number]['value']
