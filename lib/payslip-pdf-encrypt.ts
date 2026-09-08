import { createHmac } from 'crypto'
import { encryptPDF } from '@pdfsmaller/pdf-encrypt-lite'
import { payslipSecretRaw } from '@/lib/payslip-pdf-access'

const PASSWORD_HMAC_CONTEXT = 'payslip-pdf-password-v1'

/**
 * 8-digit password to open the payslip PDF — deterministic per payrollId,
 * derived from a server-only secret via HMAC-SHA256. Replaces the old
 * "last 4 digits of nationalId" scheme (backlog: payslip password review),
 * which had two real problems: only 10,000 combinations, AND the number was
 * derivable by anyone with legitimate (or illegitimate) access to see that
 * employee's national ID anywhere else in the system — the password wasn't
 * really independent of data other people could already see.
 *
 * Deliberately NOT derived from any employee PII — knowing someone's
 * national ID, phone, or birthdate must never reveal their payslip
 * password. 8 digits (100,000,000 combinations) over 6 (1,000,000) because
 * the real threat model is an unlimited OFFLINE brute-force against the
 * downloaded PDF file sitting on someone's device indefinitely, not a
 * rate-limited online guess — keyspace size is what actually matters here.
 * Deterministic by payrollId means a resend always reproduces the same
 * password with no new state to store or re-notify.
 */
export function payslipPdfPassword(payrollId: string): string {
  const digest = createHmac('sha256', payslipSecretRaw())
    .update(`${PASSWORD_HMAC_CONTEXT}:${payrollId}`)
    .digest()
  const n = digest.readUInt32BE(0) % 100_000_000
  return String(n).padStart(8, '0')
}

export async function encryptPayslipPdfBuffer(pdfBuffer: Buffer, password: string): Promise<Buffer> {
  const encrypted = await encryptPDF(new Uint8Array(pdfBuffer), password, password)
  return Buffer.from(encrypted)
}
