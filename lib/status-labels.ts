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

export const CASE_STATUS_LABEL: Record<string, string> = {
  NEW:              'ใหม่',
  ASSIGNED:         'มอบหมายแล้ว',
  INVESTIGATING:    'กำลังสืบสวน',
  NEGOTIATING:      'เจรจา',
  WAITING_DOCUMENT: 'รอเอกสาร',
  FILED:            'ยื่นฟ้อง',
  COURT_PROCESS:    'ชั้นศาล',
  ENFORCEMENT:      'บังคับคดี',
  SETTLED:          'ยุติ/ตกลง',
  COMPLETED:        'เสร็จสิ้น',
  ON_HOLD:          'พักคดี',
  CANCELLED:        'ยกเลิก',
}

export const DEBTOR_STATUS_LABEL: Record<string, string> = {
  NEW:              'รับเรื่องใหม่',
  FOLLOWING:        'กำลังติดตาม',
  PROMISE_TO_PAY:   'นัดชำระแล้ว',
  PARTIAL_PAYMENT:  'ชำระบางส่วน',
  PAID:             'ชำระแล้ว',
  LEGAL_ACTION:     'ดำเนินคดี',
  OVERDUE:          'เกินกำหนด',
  UNREACHABLE:      'ติดต่อไม่ได้',
}

export const EXPENSE_CLAIM_STATUS_LABEL: Record<string, string> = {
  PENDING:             'รอการอนุมัติ',
  SUPERVISOR_APPROVED: 'อนุมัติขั้น 1 แล้ว',
  CEO_APPROVED:        'CEO อนุมัติแล้ว',
  PAID:                'จ่ายเงินแล้ว',
  REJECTED:            'ถูกปฏิเสธ',
}

export const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  PENDING:    'รอดำเนินการ',
  PROCESSING: 'กำลังดำเนินการ',
  READY:      'พร้อมรับเอกสาร',
  REJECTED:   'ไม่อนุมัติ',
}

export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  ACTIVE:     'มีผล',
  EXPIRED:    'หมดอายุ',
  TERMINATED: 'ยกเลิก',
  PENDING:    'รออนุมัติ',
}

export const PAYMENT_APPT_STATUS_LABEL: Record<string, string> = {
  PENDING:   'รอชำระ',
  KEPT:      'ชำระแล้ว',
  MISSED:    'ผิดนัด',
  CANCELLED: 'ยกเลิก',
}

export const COURT_EVENT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED:   'กำหนดการ',
  COMPLETED:   'เสร็จแล้ว',
  MISSED:      'พลาด',
  CANCELLED:   'ยกเลิก',
  RESCHEDULED: 'เลื่อน',
}

export const RECOVERY_STATUS_LABEL: Record<string, string> = {
  PENDING:   'รออนุมัติ',
  CONFIRMED: 'ยืนยันแล้ว',
  REJECTED:  'ปฏิเสธ',
  REFUNDED:  'คืนเงิน',
}

export const CLIENT_TASK_STATUS_LABEL: Record<string, string> = {
  NEW:         'รับเรื่อง',
  ASSIGNED:    'มอบหมาย',
  IN_PROGRESS: 'ดำเนินการ',
  WAITING_DOC: 'รอเอกสาร',
  COMPLETED:   'เสร็จสิ้น',
  OVERDUE:     'เกินกำหนด',
  PENDING:     'รอ',
}
