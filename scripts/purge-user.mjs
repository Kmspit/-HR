/**
 * ลบ user และข้อมูลที่เกี่ยวข้องจาก Turso/SQLite (แก้ FK constraint)
 *
 * ใช้งาน:
 *   npm run db:purge-user -- <userId หรือ email>
 *   npm run db:purge-user -- --dry-run user@example.com
 *   npm run db:purge-user -- --yes clxxxxxxxx
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { createInterface } from 'readline'

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

  await run('users', () => db.user.delete({ where: { id: userId } }))

  return counts
}

async function main() {
  if (!target) {
    console.error('ใช้: npm run db:purge-user -- <userId หรือ email> [--dry-run] [--yes]')
    process.exit(1)
  }

  const user = await findUser(target)
  if (!user) {
    console.error('ไม่พบ user:', target)
    process.exit(1)
  }

  console.log('พบผู้ใช้:', user.name, `(${user.email})`, 'id:', user.id, 'status:', user.status)

  if (dryRun) {
    const related = {
      attendances: await prisma.attendance.count({ where: { userId: user.id } }),
      leaveRequests: await prisma.leaveRequest.count({ where: { userId: user.id } }),
      warnings: await prisma.warning.count({
        where: { OR: [{ userId: user.id }, { issuedById: user.id }] },
      }),
      approvedOthers: await prisma.user.count({ where: { approvedById: user.id } }),
    }
    console.log('--dry-run: จะลบข้อมูลตัวอย่าง', related)
    console.log('รันจริง: npm run db:purge-user -- --yes', user.id)
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

main()
  .catch((e) => {
    console.error('ล้มเหลว:', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
