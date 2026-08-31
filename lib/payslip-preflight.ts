export type PayslipBlockerCode = 'NO_PAYROLL' | 'NOT_APPROVED' | 'NO_LINE' | 'NO_NATIONAL_ID' | 'INVALID_NATIONAL_ID'

export type PayslipBlocker = {
  code: PayslipBlockerCode
  label: string
  /** What HR should actually go do to unblock this person. */
  action: string
}

export type PayslipPreflightRow = {
  hasPayroll?: boolean
  status?: string
  lineLinked?: boolean
  nationalIdStatus?: 'MASKED' | 'MISSING' | 'INVALID'
}

const BLOCKER_INFO: Record<PayslipBlockerCode, Omit<PayslipBlocker, 'code'>> = {
  NO_PAYROLL: {
    label: 'ยังไม่คำนวณเงินเดือน',
    action: 'กดคำนวณเงินเดือนก่อน',
  },
  NOT_APPROVED: {
    label: 'ยังไม่อนุมัติ',
    action: 'กดอนุมัติ payroll ก่อน',
  },
  NO_LINE: {
    label: 'ยังไม่เชื่อม LINE',
    action: 'ให้พนักงานสแกน QR เชื่อม LINE OA',
  },
  NO_NATIONAL_ID: {
    label: 'ไม่มีเลขบัตรประชาชน',
    action: 'ไปกรอกเลขบัตรประชาชนที่หน้าพนักงาน',
  },
  INVALID_NATIONAL_ID: {
    label: 'เลขบัตรประชาชนไม่ถูกต้อง',
    action: 'ตรวจสอบกับบัตรประชาชนจริงแล้วแก้ไข',
  },
}

/**
 * "ส่งได้ไหม" ใช้เกณฑ์เลข 13 หลักเป๊ะ (เหมือน maskNationalId()) — เข้มกว่า
 * nationalIdPdfPassword() ที่แค่ >=4 หลักก็สร้างรหัสได้แล้ว ตั้งใจให้เข้มกว่า:
 * เลขบัตรผิดรูปแบบ (เช่น 15 หลัก) ยังผ่าน nationalIdPdfPassword() ได้ (สร้างรหัส
 * จาก 4 ตัวท้ายของเลขที่ผิดอยู่ดี) แต่รหัสนั้นจะไม่ตรงกับเลขบัตรจริงที่พนักงานจะ
 * กรอกตอนเปิดไฟล์ — PDF เปิดไม่ได้ และถ้า HR แก้เลขให้ถูกทีหลัง รหัสจะเปลี่ยนอีก
 * ทำให้สลิปที่ส่งไปแล้วเปิดไม่ได้ถาวร "ส่งได้" ในกรณีนี้แย่กว่า "ส่งไม่ได้" จึงกัน
 * คนกลุ่มนี้ออกจาก batch ทั้งที่ทาง payslip-line-send.ts เองจะยอมส่งให้
 * (nationalIdPdfPassword() ยังไม่ได้แก้ให้เข้มตาม — ดู CONTRIBUTING note ถ้าจะทำ
 * ให้ตรงกันทั้งระบบในรอบหน้า)
 */
export function getPayslipBlockers(row: PayslipPreflightRow): PayslipBlocker[] {
  const codes: PayslipBlockerCode[] = []
  if (!row.hasPayroll) codes.push('NO_PAYROLL')
  else if (row.status !== 'APPROVED') codes.push('NOT_APPROVED')
  if (!row.lineLinked) codes.push('NO_LINE')
  if (row.nationalIdStatus === 'MISSING') codes.push('NO_NATIONAL_ID')
  else if (row.nationalIdStatus === 'INVALID') codes.push('INVALID_NATIONAL_ID')
  return codes.map((code) => ({ code, ...BLOCKER_INFO[code] }))
}

export function isPayslipSendReady(row: PayslipPreflightRow): boolean {
  return getPayslipBlockers(row).length === 0
}

/**
 * Splits a batch into who to actually attempt (`eligible`), who to skip because
 * they're known to fail (`blocked` — never sent, so a known failure never burns an
 * attempt), and who's already done (`alreadySent`). Shared by the pre-flight banner,
 * the confirm modal, and the actual batch-send call (as `excludeUserIds`), so all
 * three always agree on who's in which bucket.
 */
export function partitionPayslipBatch<
  T extends PayslipPreflightRow & { payslipSentStatus?: string | null },
>(rows: T[]): { eligible: T[]; blocked: T[]; alreadySent: T[] } {
  const eligible: T[] = []
  const blocked: T[] = []
  const alreadySent: T[] = []
  for (const row of rows) {
    if (!isPayslipSendReady(row)) {
      blocked.push(row)
    } else if (row.payslipSentStatus === 'SUCCESS') {
      alreadySent.push(row)
    } else {
      eligible.push(row)
    }
  }
  return { eligible, blocked, alreadySent }
}
