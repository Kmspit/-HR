/**
 * Live-DB verification for the payslip password HMAC change
 * (branch test/payslip-password-hmac). Read-mostly — creates one throwaway
 * user only to prove the real PDF-encryption call chain runs end to end;
 * never touches real employee data. Follows CLAUDE.md's live-DB rules.
 *
 * Usage: npx tsx scripts/verify-payslip-password-hmac.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env') })

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { payslipPdfPassword } from '../lib/payslip-pdf-encrypt'
import { getPayslipBlockers } from '../lib/payslip-preflight'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
const prisma =
  url && token
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
    : new PrismaClient()

const PAYROLL_ROLES = ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] as const

let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  OK   ${label}`)
  else { failed++; console.log(`  FAIL ${label}`, detail ?? '') }
}

async function main() {
  console.log('\n=== payslip password HMAC — live-DB verification ===\n')

  // ── 1. Deterministic + distinct, using REAL cuid-shaped payroll ids ─────
  const realPayrolls = await prisma.payroll.findMany({ select: { id: true }, take: 5 })
  check('found at least 2 real Payroll rows to test against', realPayrolls.length >= 2, realPayrolls.length)
  if (realPayrolls.length >= 2) {
    const p1a = payslipPdfPassword(realPayrolls[0].id)
    const p1b = payslipPdfPassword(realPayrolls[0].id)
    check('same real payrollId → same password (deterministic)', p1a === p1b, { p1a, p1b })
    const p2 = payslipPdfPassword(realPayrolls[1].id)
    check('different real payrollIds → different passwords', p1a !== p2, { p1a, p2 })
    check('password is exactly 8 digits', /^\d{8}$/.test(p1a), p1a)
  }

  // ── 2. Secret resolution works in this real environment (doesn't throw) ──
  try {
    const pw = payslipPdfPassword('sanity-check-payroll-id')
    check('payslipPdfPassword resolves the real secret without throwing', /^\d{8}$/.test(pw), pw)
  } catch (err) {
    check('payslipPdfPassword resolves the real secret without throwing', false, err)
  }

  // ── 3. Real employee counts — how many benefit from dropping the ────────
  //    nationalId blocker, and confirm none are blocked for that reason now
  //    (the field isn't even part of PayslipPreflightRow anymore).
  const employees = await prisma.user.findMany({
    where: { status: 'ACTIVE', role: { in: [...PAYROLL_ROLES] } },
    select: { id: true, name: true, nationalId: true, lineUserId: true },
  })
  const withoutNationalId = employees.filter((e) => !e.nationalId)
  console.log(`  INFO active payroll-eligible employees: ${employees.length}, without nationalId: ${withoutNationalId.length}`)
  for (const emp of withoutNationalId) {
    const blockers = getPayslipBlockers({ hasPayroll: true, status: 'APPROVED', lineLinked: !!emp.lineUserId })
    check(`employee without nationalId (${emp.name}) is not blocked by any nationalId-related code`, !blockers.some((b) => (b.code as string).includes('NATIONAL_ID')))
  }

  // ── 4. Full real PDF-encryption call chain runs end to end with the new
  //    password (proves no runtime error in the integration; the RC4
  //    password-gate itself is pdf-encrypt-lite's own pre-existing,
  //    unchanged behavior — not something a password-blind tool like
  //    pdf-lib can re-verify from this sandbox, see the written report).
  const { PDFDocument } = await import('pdf-lib')
  const { encryptPayslipPdfBuffer } = await import('../lib/payslip-pdf-encrypt')
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  const plainBytes = Buffer.from(await doc.save())
  const password = payslipPdfPassword('live-verify-fake-payroll-id')
  try {
    const encrypted = await encryptPayslipPdfBuffer(plainBytes, password)
    check('real PDF successfully encrypted with the HMAC-derived password (no runtime error)', encrypted.length > 0, encrypted.length)
  } catch (err) {
    check('real PDF successfully encrypted with the HMAC-derived password (no runtime error)', false, err)
  }

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('verification script crashed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
