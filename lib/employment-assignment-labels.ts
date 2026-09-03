import type { EmploymentChangeType, TerminationType } from '@prisma/client'

/** Thai labels for EmploymentAssignment.changeType — shared between the
 *  "ประวัติตำแหน่ง" tab's timeline display and the "สร้างประวัติใหม่" form's
 *  changeType picker (Phase 1 step 8c). */
export const CHANGE_TYPE_LABELS: Record<EmploymentChangeType, string> = {
  HIRE: 'เริ่มงาน',
  PROBATION_PASS: 'ผ่านทดลองงาน',
  PROMOTION: 'เลื่อนตำแหน่ง',
  TRANSFER: 'ย้ายแผนก',
  CONTRACT_RENEW: 'ต่อสัญญา',
  TERMINATION: 'พ้นสภาพ',
}

export const TERMINATION_TYPE_LABELS: Record<TerminationType, string> = {
  RESIGN: 'ลาออก',
  DISMISS: 'เลิกจ้าง',
  CONTRACT_END: 'ครบสัญญา',
  RETIRE: 'เกษียณ',
  DECEASED: 'เสียชีวิต',
}
