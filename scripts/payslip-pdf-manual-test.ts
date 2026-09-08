/**
 * Manual QA for the payslip-password-hmac change: builds and encrypts a REAL
 * payslip PDF for one real, approved Payroll row using the exact same
 * production call chain (buildPayrollSlipPdfBuffer + encryptPayslipPdfBuffer
 * + payslipPdfPassword), then writes the encrypted PDF to local disk.
 *
 * This exists because no library in this project can programmatically verify
 * that a real PDF reader will accept the password on an RC4-encrypted PDF
 * (pdf-lib can't; see scripts/verify-payslip-password-hmac.ts's note). A
 * human opening the file with a real reader is the only way to close that
 * gap — this script's only job is to produce that file safely.
 *
 * Read-only against the DB. Does NOT call sendPayslipViaLineForPayroll, does
 * NOT upload to Cloudinary, does NOT push a LINE message, does NOT write
 * payslipSentStatus or any other column. The only output is a local .pdf
 * file plus the password printed to the console.
 *
 * Usage: npx tsx scripts/payslip-pdf-manual-test.ts [payrollId]
 *   - With no argument, picks the first APPROVED payroll row it finds.
 *   - Prints the password, then delete the output file when you're done
 *     testing (it's a real employee's real salary data).
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { writeFile } from 'fs/promises'

config({ path: resolve(process.cwd(), '.env') })

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { loadPayrollForSlip, buildPayrollSlipPdfBuffer } from '../lib/payslip-pdf-service'
import { payslipPdfPassword, encryptPayslipPdfBuffer } from '../lib/payslip-pdf-encrypt'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
const prisma =
  url && token
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
    : new PrismaClient()

async function main() {
  const argId = process.argv[2]

  const payrollId =
    argId ??
    (
      await prisma.payroll.findFirst({
        where: { status: 'APPROVED', deletedAt: null },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      })
    )?.id

  if (!payrollId) {
    console.error('No APPROVED payroll row found (and no payrollId argument given). Nothing to test.')
    process.exitCode = 1
    return
  }

  const payroll = await loadPayrollForSlip(payrollId)
  if (!payroll) {
    console.error(`Payroll ${payrollId} not found or deleted.`)
    process.exitCode = 1
    return
  }

  console.log(`Building real payslip PDF for payrollId=${payrollId} (${payroll.user.name}, ${payroll.month}/${payroll.year})...`)

  const { buffer, filename } = await buildPayrollSlipPdfBuffer(payroll)
  const password = payslipPdfPassword(payrollId)
  const encrypted = await encryptPayslipPdfBuffer(buffer, password)

  const outPath = resolve(process.cwd(), `manual-test-${filename}`)
  await writeFile(outPath, encrypted)

  console.log('')
  console.log('=== DONE — nothing was sent, uploaded, or written to the DB ===')
  console.log(`File:     ${outPath}`)
  console.log(`Password: ${password}`)
  console.log('')
  console.log('Open the file with a real PDF reader (Acrobat / macOS Preview / a phone app)')
  console.log('and enter the password above. If it opens, the encryption pipeline is verified')
  console.log('end to end with the new HMAC-derived password.')
  console.log('')
  console.log('This file contains a real employee\'s real salary data — delete it when done:')
  console.log(`  rm "${outPath}"`)
}

main()
  .catch((err) => {
    console.error('script crashed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
