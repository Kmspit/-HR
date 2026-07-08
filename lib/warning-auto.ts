import { prisma } from '@/lib/prisma'
import { createNotification, createAuditLog } from '@/lib/notifications'

const LATE_THRESHOLD = 3

function getBangkokMonthBounds(): { month: number; year: number; start: Date; end: Date } {
  const now = new Date()
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const year = bkk.getUTCFullYear()
  const month = bkk.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  const dd = String(lastDay).padStart(2, '0')
  return {
    month,
    year,
    start: new Date(`${year}-${mm}-01T00:00:00+07:00`),
    end:   new Date(`${year}-${mm}-${dd}T23:59:59+07:00`),
  }
}

/** Check late count for userId in current Bangkok month and create a PENDING_APPROVAL warning when threshold is hit */
export async function checkAndCreateAutoWarning(userId: string): Promise<boolean> {
  const { month, year, start, end } = getBangkokMonthBounds()

  // Avoid duplicate warning in the same month (ignore REJECTED ones — user may get warned again next month)
  const existing = await prisma.warning.findFirst({
    where: { userId, isAuto: true, month, year, status: { not: 'REJECTED' } },
  })
  if (existing) return false

  const lateCount = await prisma.attendance.count({
    where: { userId, status: 'LATE', date: { gte: start, lte: end } },
  })

  if (lateCount < LATE_THRESHOLD) return false

  // Use first SUPER_ADMIN as system issuer; fall back to employee's own id
  const sysAdmin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  const expiredAt = new Date()
  expiredAt.setMonth(expiredAt.getMonth() + 12)

  let employee: { name: string | null; department: string | null } | null
  let warning: Awaited<ReturnType<typeof prisma.warning.create>>
  try {
    ;[employee, warning] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, department: true } }),
      prisma.warning.create({
        data: {
          userId,
          issuedById: sysAdmin?.id ?? userId,
          level: 1,
          reason: `มาสายสะสม ${lateCount} ครั้ง ในเดือน ${month}/${year} (ระบบอัตโนมัติ)`,
          isAuto: true,
          month,
          year,
          status: 'PENDING_APPROVAL',
          expiredAt,
          lateCount,
        },
      }),
    ])
  } catch (err) {
    // Racing against warningEngine.runWarningCheck (or another concurrent checkin)
    // for the same user/month — the DB-level dedup index (warnings_auto_dedup_idx)
    // rejected this insert because the other path already won. Not an error.
    if ((err as { code?: string })?.code === 'P2002') return false
    throw err
  }

  // Notify all SUPER_ADMIN users (CEO)
  const admins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
    select: { id: true },
  })

  const name = employee?.name ?? userId
  await Promise.all([
    ...admins.map((a) =>
      createNotification({
        userId: a.id,
        type: 'WARNING_ISSUED',
        title: 'รออนุมัติใบเตือน',
        message: `${name} มาสาย ${lateCount} ครั้ง — รออนุมัติ`,
        link: `/warnings/${warning.id}`,
      })
    ),
    createAuditLog({
      actorId: sysAdmin?.id ?? userId,
      targetId: userId,
      targetType: 'Warning',
      action: 'CREATE',
      after: { warningId: warning.id, lateCount, month, year, status: 'PENDING_APPROVAL' },
    }),
  ])

  return true
}

/** Batch-archive all warnings whose expiredAt has passed */
export async function archiveExpiredWarnings(): Promise<number> {
  const now = new Date()
  const { count } = await prisma.warning.updateMany({
    where: { status: 'APPROVED', expiredAt: { lte: now } },
    data: { status: 'ARCHIVED', archivedAt: now },
  })
  return count
}
