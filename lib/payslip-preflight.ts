export type PayslipBlockerCode = 'NO_PAYROLL' | 'NOT_APPROVED' | 'NO_LINE'

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
}

/**
 * The two nationalId-based blockers (NO_NATIONAL_ID / INVALID_NATIONAL_ID)
 * that used to live here are gone — the payslip PDF password no longer
 * derives from nationalId at all (see lib/payslip-pdf-encrypt.ts's
 * payslipPdfPassword, deterministic from payrollId + a server secret
 * instead). A missing or malformed national ID no longer has anything to
 * do with whether a payslip can be sent.
 */
export function getPayslipBlockers(row: PayslipPreflightRow): PayslipBlocker[] {
  const codes: PayslipBlockerCode[] = []
  if (!row.hasPayroll) codes.push('NO_PAYROLL')
  else if (row.status !== 'APPROVED') codes.push('NOT_APPROVED')
  if (!row.lineLinked) codes.push('NO_LINE')
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
