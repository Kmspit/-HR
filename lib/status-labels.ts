/** Shared Thai-language label maps for status fields across the app. */

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDING:          'รออนุมัติ',
  pending_ceo:      'รออนุมัติ',
  APPROVED:         'อนุมัติ',
  approved_by_ceo:  'อนุมัติ',
  REJECTED:         'ไม่อนุมัติ',
  rejected_by_ceo:  'ไม่อนุมัติ',
}

export const TASK_STATUS_LABEL: Record<string, string> = {
  PENDING:           'รอมอบหมาย',
  NEW:               'รับเรื่องใหม่',
  ASSIGNED:          'มอบหมายแล้ว',
  IN_PROGRESS:       'กำลังดำเนินการ',
  WAITING_DOC:       'รอเอกสาร',
  WAITING_REVIEW:    'รอตรวจสอบ',
  WAITING_APPROVAL:  'รออนุมัติ',
  REVISION:          'แก้ไขงาน',
  COMPLETED:         'เสร็จสิ้น',
  OVERDUE:           'เกินกำหนด',
  CANCELLED:         'ยกเลิก',
}

export const USER_STATUS_LABEL: Record<string, string> = {
  ACTIVE:   'ใช้งานได้',
  PENDING:  'รออนุมัติ',
  DISABLED: 'ปิดการใช้งาน',
  REJECTED: 'ถูกปฏิเสธ',
}

export const WORKLOAD_STATUS_LABEL: Record<string, string> = {
  LOW:        'ภาระเบา',
  NORMAL:     'ปกติ',
  HIGH:       'ภาระหนัก',
  OVERLOADED: 'เกินกำลัง',
}
