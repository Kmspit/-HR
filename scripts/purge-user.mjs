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
 *
 * Also blocks on 12 more tables discovered during the pre-pilot wipe review
 * (2026-09-09): each has a REQUIRED (NOT NULL) FK to users.id with
 * ON DELETE RESTRICT/NO ACTION in the real DB. purgeUser() cannot null these
 * out (Prisma rejects writing null to a non-nullable column) and must not
 * silently delete real business/financial/case records (invoices, payments,
 * receipts, court dates, case activity/timeline logs, debtor contact logs,
 * promises to pay, recovery payments, automation rules) just because the
 * staff member who created/handled them is being purged — so a target
 * account with any row here is refused, same as payroll/warnings/tax above.
 * (billing_invoices.approvedById and billing_payments.receivedById are the
 * only two of the original 14 flagged pairs that ARE nullable — those are
 * cleared in purgeUser() below instead of blocking here.)
 *
 * case_templates.created_by_id is checked via raw SQL: that table has a real
 * FK in the live DB but no corresponding Prisma model on either this branch
 * or main (the "case template" feature was removed from the schema while
 * the table + constraint were left behind) — there is no `db.caseTemplate`
 * to call at all.
 */
async function checkPurgeGuard(db, userId) {
  const [
    payrolls, warnings, taxHistories, auditLogsAsActor,
    billingInvoicesCreated, billingPaymentsCreated, billingReceiptsCreated,
    caseCourtsCreated, caseTimelines, caseDebtorActivities,
    debtorContacts, promisesToPay, recoveryPaymentsCreated, recoveryPaymentsCollected,
    automationRules, caseTemplatesRaw,
  ] = await Promise.all([
    db.payroll.count({ where: { userId } }),
    db.warning.count({ where: { userId } }),
    db.taxHistory.count({ where: { userId } }),
    db.auditLog.count({ where: { actorId: userId } }),
    db.billingInvoice.count({ where: { createdById: userId } }),
    db.billingPayment.count({ where: { createdById: userId } }),
    db.billingReceipt.count({ where: { createdById: userId } }),
    db.caseCourt.count({ where: { createdById: userId } }),
    db.caseTimeline.count({ where: { userId } }),
    db.caseDebtorActivity.count({ where: { actorId: userId } }),
    db.debtorContact.count({ where: { performedById: userId } }),
    db.promiseToPay.count({ where: { createdById: userId } }),
    db.recoveryPayment.count({ where: { createdById: userId } }),
    db.recoveryPayment.count({ where: { collectorId: userId } }),
    db.automationRule.count({ where: { createdById: userId } }),
    db.$queryRawUnsafe('SELECT COUNT(*) as cnt FROM case_templates WHERE created_by_id = ?', userId),
  ])
  const caseTemplates = Number(caseTemplatesRaw?.[0]?.cnt ?? 0)

  const found = []
  if (payrolls > 0) found.push({ label: 'payroll', count: payrolls })
  if (warnings > 0) found.push({ label: 'warnings (เอกสารวินัย)', count: warnings })
  if (taxHistories > 0) found.push({ label: 'tax_histories (เอกสารภาษี)', count: taxHistories })
  if (auditLogsAsActor > 0) found.push({ label: 'audit_logs ที่เป็น actor', count: auditLogsAsActor })
  if (billingInvoicesCreated > 0) found.push({ label: 'billing_invoices (ผู้สร้าง)', count: billingInvoicesCreated })
  if (billingPaymentsCreated > 0) found.push({ label: 'billing_payments (ผู้สร้าง)', count: billingPaymentsCreated })
  if (billingReceiptsCreated > 0) found.push({ label: 'billing_receipts (ผู้สร้าง)', count: billingReceiptsCreated })
  if (caseCourtsCreated > 0) found.push({ label: 'case_courts (ผู้สร้าง)', count: caseCourtsCreated })
  if (caseTimelines > 0) found.push({ label: 'case_timelines (ผู้กระทำ)', count: caseTimelines })
  if (caseDebtorActivities > 0) found.push({ label: 'case_debtor_activities (ผู้กระทำ)', count: caseDebtorActivities })
  if (debtorContacts > 0) found.push({ label: 'debtor_contacts (ผู้ติดต่อ)', count: debtorContacts })
  if (promisesToPay > 0) found.push({ label: 'promises_to_pay (ผู้สร้าง)', count: promisesToPay })
  if (recoveryPaymentsCreated > 0) found.push({ label: 'recovery_payments (ผู้สร้าง)', count: recoveryPaymentsCreated })
  if (recoveryPaymentsCollected > 0) found.push({ label: 'recovery_payments (ผู้เก็บเงิน)', count: recoveryPaymentsCollected })
  if (automationRules > 0) found.push({ label: 'automation_rules (ผู้สร้าง)', count: automationRules })
  if (caseTemplates > 0) found.push({ label: 'case_templates (ผู้สร้าง, ไม่มี Prisma model)', count: caseTemplates })

  return found
}

/** True only when checkPurgeGuard() found blockers AND --force-guard was NOT
 *  passed — the one condition under which main() must refuse to proceed.
 *  Extracted as a pure function so the --force-guard behavior (both with and
 *  without) has its own test, independent of process.argv/process.exit. */
function shouldBlockPurge(blockers, forceGuard) {
  return blockers.length > 0 && !forceGuard
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

  // The only 2 of the 14 FK gaps found in the 2026-09-09 wipe review that
  // are actually nullable — every other one is a required (NOT NULL) column
  // and is a checkPurgeGuard() blocker instead (see that function's comment).
  await run('billing_invoices.approvedById cleared', () =>
    db.billingInvoice.updateMany({ where: { approvedById: userId }, data: { approvedById: null } }),
  )
  await run('billing_payments.receivedById cleared', () =>
    db.billingPayment.updateMany({ where: { receivedById: userId }, data: { receivedById: null } }),
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

/**
 * Runs purgeUser() inside a single prisma.$transaction() and returns its
 * per-table counts — used for BOTH --dry-run (rollback: true, always aborts
 * via DryRunAbort so nothing is written) and the real run (rollback: false,
 * lets the transaction commit). Real deletes used to run un-transacted,
 * step by step — a FK error partway through (e.g. a future gap this
 * script's guard doesn't yet know about) would leave the account
 * half-deleted: some tables cleared, the `users` row still there. Wrapping
 * the real path the same way dry-run already worked means any failure now
 * rolls everything back atomically instead of leaving a half-purged account.
 */
async function purgeUserInTransaction(db, userId, { rollback }) {
  if (!rollback) {
    return db.$transaction((tx) => purgeUser(tx, userId))
  }
  try {
    await db.$transaction(async (tx) => {
      const counts = await purgeUser(tx, userId)
      throw new DryRunAbort(counts)
    })
    throw new Error('unreachable: dry-run transaction did not abort')
  } catch (e) {
    if (e instanceof DryRunAbort) return e.counts
    throw e
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
    if (shouldBlockPurge(blockers, forceGuard)) process.exit(1)
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

    const counts = await purgeUserInTransaction(prisma, user.id, { rollback: true })
    console.log(`--dry-run: จะลบข้อมูลของ "${user.name}" (${user.email}) ดังนี้ (ไม่มีอะไรถูกลบจริง — transaction ถูก rollback):`)
    const entries = Object.entries({ ...counts, ...cascadeCounts }).filter(([, v]) => v > 0)
    if (entries.length === 0) console.log('  (ไม่มีข้อมูลผูกอยู่เลยนอกจากตัว user เอง)')
    for (const [k, v] of entries) console.log(`  - ${k}: ${v}${Object.prototype.hasOwnProperty.call(cascadeCounts, k) ? ' (cascade อัตโนมัติ)' : ''}`)
    console.log('รันจริง: npm run db:purge-user --', forceGuard ? '--force-guard ' : '', '--yes', user.id)
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
  const counts = await purgeUserInTransaction(prisma, user.id, { rollback: false })
  console.log('ลบสำเร็จ:')
  for (const [k, v] of Object.entries(counts)) {
    if (v > 0) console.log(' ', k + ':', v)
  }
  console.log('✓ ลบ user แล้ว —', user.email)
}

export { checkPurgeGuard, purgeUser, purgeUserInTransaction, DryRunAbort, shouldBlockPurge }

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
