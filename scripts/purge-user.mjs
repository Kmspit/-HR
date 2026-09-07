/**
 * ลบ user และข้อมูลที่เกี่ยวข้องจาก Turso/SQLite (แก้ FK constraint)
 *
 * ใช้งาน:
 *   npm run db:purge-user -- <userId หรือ email>
 *   npm run db:purge-user -- --dry-run user@example.com
 *   npm run db:purge-user -- --yes clxxxxxxxx
 *   npm run db:purge-user -- --force-guard --yes clxxxxxxxx
 *
 * --force-guard: ข้าม checkPurgeGuard (ปกติบล็อกบัญชีที่มี payroll/warnings/
 * taxHistory/audit-log-ที่เป็น-actor เพราะกู้คืนไม่ได้ตามกฎหมาย) — ใช้เฉพาะ
 * ตอนที่ยืนยันแล้วว่าบัญชีเป้าหมายไม่ใช่พนักงานจริงที่ต้องเก็บประวัติไว้
 * ยังพิมพ์รายการที่ guard เจอให้เห็นเสมอ ไม่ได้ซ่อนไว้ — แค่ไม่ exit(1)
 * ไม่เปลี่ยนพฤติกรรม default (ไม่ใส่ flag นี้ ยังบล็อกเหมือนเดิมทุกกรณี)
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { createInterface } from 'readline'
import { pathToFileURL } from 'url'

config({ path: resolve(process.cwd(), '.env') })

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

const prisma =
  url && token
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
    : new PrismaClient()

const args = process.argv.slice(2).filter((a) => a !== '--')
const dryRun = args.includes('--dry-run')
const yes = args.includes('--yes')
const forceGuard = args.includes('--force-guard')
const target = args.find((a) => !a.startsWith('--'))

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

async function findUser(ref) {
  if (!ref) return null
  const byId = await prisma.user.findUnique({ where: { id: ref } })
  if (byId) return byId
  return prisma.user.findUnique({ where: { email: ref } })
}

/**
 * This script hard-deletes — it should only ever run against test accounts.
 * Block on any data a real employee would have that can't be recreated:
 * payroll (legally retained, counts soft-deleted rows too since those are
 * still real payslip history), disciplinary warnings, tax history, and any
 * audit log where this user is the actor (their action history).
 */
async function checkPurgeGuard(db, userId) {
  const [payrolls, warnings, taxHistories, auditLogsAsActor] = await Promise.all([
    db.payroll.count({ where: { userId } }),
    db.warning.count({ where: { userId } }),
    db.taxHistory.count({ where: { userId } }),
    db.auditLog.count({ where: { actorId: userId } }),
  ])

  const found = []
  if (payrolls > 0) found.push({ label: 'payroll', count: payrolls })
  if (warnings > 0) found.push({ label: 'warnings (เอกสารวินัย)', count: warnings })
  if (taxHistories > 0) found.push({ label: 'tax_histories (เอกสารภาษี)', count: taxHistories })
  if (auditLogsAsActor > 0) found.push({ label: 'audit_logs ที่เป็น actor', count: auditLogsAsActor })

  return found
}

async function purgeUser(db, userId) {
  const leaveIds = (
    await db.leaveRequest.findMany({ where: { userId }, select: { id: true } })
  ).map((r) => r.id)
  const outsideIds = (
    await db.outsideWorkRequest.findMany({ where: { userId }, select: { id: true } })
  ).map((r) => r.id)
  const planIds = (
    await db.weeklyLawyerPlan.findMany({ where: { lawyerId: userId }, select: { id: true } })
  ).map((r) => r.id)

  const counts = {}

  const run = async (label, fn) => {
    const result = await fn()
    counts[label] =
      result && typeof result.count === 'number' ? result.count : result ? 1 : 0
  }

  // login_attempts/security_events: schema.prisma declares onDelete: SetNull
  // for both, but (same class of gap as the 5 Phase-1 tables fixed in
  // v900029) the live DB has no real FK on either — confirmed via
  // PRAGMA foreign_key_list during Phase 1's closeout audit. Deleted
  // outright here (not nulled — nothing reads these rows by anything
  // other than userId, so a null-userId row would just be dead weight).
  await run('login_attempts', () => db.loginAttempt.deleteMany({ where: { userId } }))
  await run('security_events', () => db.securityEvent.deleteMany({ where: { userId } }))
  // calendar_events.createdById has no real FK either and no cascade —
  // same "owned record, delete wholesale" treatment already given to
  // leaveRequest/outsideWorkRequest/weeklyLawyerPlan below.
  await run('calendar_events', () => db.calendarEvent.deleteMany({ where: { createdById: userId } }))

  await run('attendance_face_logs', () =>
    db.attendanceFaceLog.deleteMany({ where: { userId } }),
  )
  await run('attendance_face_scans', () =>
    db.attendanceFaceScan.deleteMany({ where: { userId } }),
  )
  await run('attendance_line_notify_logs', () =>
    db.attendanceLineNotifyLog.deleteMany({ where: { employeeUserId: userId } }),
  )
  await run('user_face_profiles', () => db.userFaceProfile.deleteMany({ where: { userId } }))
  await run('saved_work_places', () => db.savedWorkPlace.deleteMany({ where: { userId } }))
  await run('user_devices', () => db.userDevice.deleteMany({ where: { userId } }))

  if (planIds.length) {
    await run('weekly_plan_days', () =>
      db.weeklyPlanDay.deleteMany({ where: { planId: { in: planIds } } }),
    )
  }

  await run('approval_histories (by user)', () =>
    db.approvalHistory.deleteMany({ where: { approvedById: userId } }),
  )
  if (leaveIds.length) {
    await run('approval_histories (leave)', () =>
      db.approvalHistory.deleteMany({ where: { leaveRequestId: { in: leaveIds } } }),
    )
  }
  if (outsideIds.length) {
    await run('approval_histories (outside)', () =>
      db.approvalHistory.deleteMany({ where: { outsideRequestId: { in: outsideIds } } }),
    )
  }
  if (planIds.length) {
    await run('approval_histories (weekly)', () =>
      db.approvalHistory.deleteMany({ where: { weeklyPlanId: { in: planIds } } }),
    )
  }

  await run('leave_requests', () => db.leaveRequest.deleteMany({ where: { userId } }))
  await run('outside_work_requests', () =>
    db.outsideWorkRequest.deleteMany({ where: { userId } }),
  )
  await run('weekly_lawyer_plans', () =>
    db.weeklyLawyerPlan.deleteMany({ where: { lawyerId: userId } }),
  )
  await run('notifications', () => db.notification.deleteMany({ where: { userId } }))
  await run('audit_logs (actor)', () => db.auditLog.deleteMany({ where: { actorId: userId } }))
  await run('audit_logs (target)', () => db.auditLog.deleteMany({ where: { targetId: userId } }))
  await run('warnings (subject)', () => db.warning.deleteMany({ where: { userId } }))
  await run('warnings (issued)', () => db.warning.deleteMany({ where: { issuedById: userId } }))
  await run('payrolls', () => db.payroll.deleteMany({ where: { userId } }))
  await run('salary_slips', () => db.salarySlip.deleteMany({ where: { userId } }))
  await run('tax_histories', () => db.taxHistory.deleteMany({ where: { userId } }))
  await run('forgot_scan_requests', () => db.forgotScanRequest.deleteMany({ where: { userId } }))
  await run('attendances', () => db.attendance.deleteMany({ where: { userId } }))
  await run('leave_balances', () => db.leaveBalance.deleteMany({ where: { userId } }))

  await run('task_assignments', () =>
    db.taskAssignment.deleteMany({
      where: {
        OR: [
          { assigneeId: userId },
          { assignedById: userId },
          { reviewedById: userId },
          { clientId: userId },
        ],
      },
    }),
  )

  await run('users.approvedById cleared', () =>
    db.user.updateMany({ where: { approvedById: userId }, data: { approvedById: null } }),
  )
  await run('users.managerId cleared', () =>
    db.user.updateMany({ where: { managerId: userId }, data: { managerId: null } }),
  )
  await run('users.teamLeaderId cleared', () =>
    db.user.updateMany({ where: { teamLeaderId: userId }, data: { teamLeaderId: null } }),
  )
  await run('company_holidays.createdById cleared', () =>
    db.companyHoliday.updateMany({
      where: { createdById: userId },
      data: { createdById: null },
    }),
  )

  // employee_profiles/emergency_contacts/dependents/bank_accounts/
  // employment_assignments need no explicit handling here — as of migration
  // v900029 (Phase 1 closeout) they have a real FK + ON DELETE CASCADE, so
  // the users delete below removes them automatically. Before v900029 this
  // script would have left every one of those behind as a permanent orphan
  // (confirmed the hard way — see that migration's own commit message).
  await run('users', () => db.user.delete({ where: { id: userId } }))

  return counts
}

/** Thrown to force a rollback after running the real purgeUser() logic
 *  inside a transaction — this is how --dry-run gets its numbers, so a
 *  dry-run can never drift from what a real run actually deletes (a
 *  hand-maintained parallel count list could silently go stale). */
class DryRunAbort extends Error {
  constructor(counts) {
    super('dry-run-abort')
    this.counts = counts
  }
}

async function main() {
  if (!target) {
    console.error('ใช้: npm run db:purge-user -- <userId หรือ email> [--dry-run] [--yes] [--force-guard]')
    process.exit(1)
  }

  const user = await findUser(target)
  if (!user) {
    console.error('ไม่พบ user:', target)
    process.exit(1)
  }

  console.log('พบผู้ใช้:', user.name, `(${user.email})`, 'id:', user.id, 'status:', user.status)

  const blockers = await checkPurgeGuard(prisma, user.id)
  if (blockers.length > 0) {
    console.error(
      forceGuard
        ? '⚠ guard เจอข้อมูลที่ปกติจะบล็อก แต่ --force-guard ให้ดำเนินการต่อ:'
        : '✗ ปฏิเสธ — บัญชีนี้มีข้อมูลที่กู้คืนไม่ได้ สคริปต์นี้ใช้ลบได้เฉพาะบัญชีทดสอบเท่านั้น:',
    )
    for (const b of blockers) console.error(`  - ${b.label}: ${b.count} รายการ`)
    if (!forceGuard) process.exit(1)
  }

  if (dryRun) {
    // These 5 (Phase 1) tables need no explicit delete call in purgeUser()
    // any more — v900029 made them real ON DELETE CASCADE — so they never
    // appear in its `counts` object even though the real run does remove
    // them (silently, via the DB's own FK trigger the instant `users` is
    // deleted). Queried here purely so --dry-run's report is a complete
    // picture, not because the real deletion path needs them.
    const cascadeCounts = {
      employee_profiles: await prisma.employeeProfile.count({ where: { userId: user.id } }),
      emergency_contacts: await prisma.emergencyContact.count({ where: { userId: user.id } }),
      dependents: await prisma.dependent.count({ where: { userId: user.id } }),
      bank_accounts: await prisma.bankAccount.count({ where: { userId: user.id } }),
      employment_assignments: await prisma.employmentAssignment.count({ where: { userId: user.id } }),
    }

    try {
      await prisma.$transaction(async (tx) => {
        const counts = await purgeUser(tx, user.id)
        throw new DryRunAbort(counts)
      })
    } catch (e) {
      if (!(e instanceof DryRunAbort)) throw e
      console.log(`--dry-run: จะลบข้อมูลของ "${user.name}" (${user.email}) ดังนี้ (ไม่มีอะไรถูกลบจริง — transaction ถูก rollback):`)
      const entries = Object.entries({ ...e.counts, ...cascadeCounts }).filter(([, v]) => v > 0)
      if (entries.length === 0) console.log('  (ไม่มีข้อมูลผูกอยู่เลยนอกจากตัว user เอง)')
      for (const [k, v] of entries) console.log(`  - ${k}: ${v}${Object.prototype.hasOwnProperty.call(cascadeCounts, k) ? ' (cascade อัตโนมัติ)' : ''}`)
      console.log('รันจริง: npm run db:purge-user --', forceGuard ? '--force-guard ' : '', '--yes', user.id)
    }
    return
  }

  if (!yes) {
    const answer = await ask(
      `ยืนยันลบถาวร "${user.name}" และข้อมูลทั้งหมด? พิมพ์ yes: `,
    )
    if (answer !== 'yes') {
      console.log('ยกเลิก')
      return
    }
  }

  console.log('กำลังลบ... (Turso อาจใช้เวลาสักครู่)')
  const counts = await purgeUser(prisma, user.id)
  console.log('ลบสำเร็จ:')
  for (const [k, v] of Object.entries(counts)) {
    if (v > 0) console.log(' ', k + ':', v)
  }
  console.log('✓ ลบ user แล้ว —', user.email)
}

export { checkPurgeGuard }

// Running as a script (not imported for its exports, e.g. by tests) — skip
// `main()` on import so requiring this module never touches the DB or exits
// the process as a side effect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => {
      console.error('ล้มเหลว:', e.message)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
