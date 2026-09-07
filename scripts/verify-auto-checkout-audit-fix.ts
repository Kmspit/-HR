/**
 * Live-DB verification for the 4.2 backlog fix (auto-checkout cron's
 * actorId FK bug). Follows CLAUDE.md's live-DB rules: creates a throwaway
 * user + throwaway attendance row with an unambiguous email, never touches
 * a real account, and deletes everything it created at the end.
 *
 * Proves the actual bug is gone: before this fix, calling the real GET
 * route handler on an open attendance session would silently fail to write
 * any AuditLog row (actorId:'system' violated the FK, swallowed by
 * createAuditLog's try/catch). This calls the real route handler and checks
 * an AuditLog row now exists with actorId=null, actorLabel='cron:auto-checkout'.
 *
 * Usage: npx tsx scripts/verify-auto-checkout-audit-fix.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env') })

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
const prisma =
  url && token
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
    : new PrismaClient()

const cronSecret = (process.env.CRON_SECRET || process.env.HRFLOW_CRON_SECRET || '').trim()
if (!cronSecret) throw new Error('CRON_SECRET/HRFLOW_CRON_SECRET not set — cannot call the real route handler')

const stamp = Date.now()
const tag = `script-verify-${stamp}`
const email = `${tag}-checkout@test.com`

let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  OK   ${label}`)
  else { failed++; console.log(`  FAIL ${label}`, detail ?? '') }
}

async function main() {
  console.log(`\n=== auto-checkout audit-log fix — live-DB verification (${tag}) ===\n`)

  const user = await prisma.user.create({
    data: { email, passwordHash: 'x', name: `Script Verify Checkout ${stamp}`, role: 'EMPLOYEE', status: 'ACTIVE' },
  })

  try {
    // checkIn 3 hours ago, well inside the 48h lookback and before today's
    // 22:00 Bangkok cutoff — checkOut left null so the cron picks it up.
    const checkIn = new Date(Date.now() - 3 * 60 * 60 * 1000)
    const attendance = await prisma.attendance.create({
      data: { userId: user.id, date: checkIn, checkIn, checkOut: null, autoCheckout: false, attendanceStatus: 'in_progress' },
    })
    console.log(`created throwaway user=${user.id} attendance=${attendance.id} (checkIn=${checkIn.toISOString()})`)

    const { GET } = await import('../app/api/cron/auto-checkout/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest('http://localhost/api/cron/auto-checkout', {
      headers: { 'x-cron-secret': cronSecret },
    })
    const res = await GET(req)
    const body = await res.json()
    check('route responded 200', res.status === 200, res.status)
    check(`this throwaway session was included in applied count (applied=${body.applied})`, (body.applied ?? 0) >= 1, body)

    const updated = await prisma.attendance.findUnique({ where: { id: attendance.id } })
    check('Attendance row was closed by the cron (checkOut set, autoCheckout=true)', updated?.autoCheckout === true && updated?.checkOut !== null)

    const auditRows = await prisma.auditLog.findMany({ where: { targetId: attendance.id, targetType: 'Attendance' } })
    check('AuditLog row now exists for this Attendance (this is exactly what used to silently fail)', auditRows.length === 1, auditRows)
    if (auditRows.length === 1) {
      check('actorId is null (not the old FK-violating "system" sentinel)', auditRows[0].actorId === null, auditRows[0].actorId)
      check("actorLabel identifies the cron ('cron:auto-checkout')", auditRows[0].actorLabel === 'cron:auto-checkout', auditRows[0].actorLabel)
      check('action is UPDATE', auditRows[0].action === 'UPDATE', auditRows[0].action)
    }

    console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}\n`)
  } finally {
    const ownAttendance = await prisma.attendance.findMany({ where: { userId: user.id }, select: { id: true } })
    const attendanceIds = ownAttendance.map((a) => a.id)
    if (attendanceIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { targetId: { in: attendanceIds }, targetType: 'Attendance' } })
    }
    await prisma.notification.deleteMany({ where: { userId: user.id } })
    await prisma.attendance.deleteMany({ where: { userId: user.id } })
    await prisma.user.deleteMany({ where: { id: user.id } })
    console.log('cleanup done — all throwaway rows removed')
  }

  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('verification script crashed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
