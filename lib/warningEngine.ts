import { prisma } from '@/lib/prisma'
import { deliverWarningToEmployee } from '@/lib/warning-delivery'

type WarningCheckResult = {
  userId: string
  name: string
  level: number
  reason: string
  lateCount: number
  absentCount: number
}

export async function runWarningCheck(options?: { userIds?: string[] }): Promise<WarningCheckResult[]> {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)

  const rules = await prisma.warningRule.findMany({
    where: { isActive: true },
    orderBy: { level: 'asc' },
  })

  if (rules.length === 0) {
    // Default rules if none configured
    rules.push(
      { id: 'default-1', level: 1, name: 'ใบเตือนระดับ 1', lateThreshold: 3, absentThreshold: 1, periodDays: 30, isActive: true, createdAt: new Date() },
      { id: 'default-2', level: 2, name: 'ใบเตือนระดับ 2', lateThreshold: 5, absentThreshold: 2, periodDays: 30, isActive: true, createdAt: new Date() },
      { id: 'default-3', level: 3, name: 'ใบเตือนระดับ 3', lateThreshold: 7, absentThreshold: 3, periodDays: 30, isActive: true, createdAt: new Date() }
    )
  }

  const userIds = options?.userIds?.filter(Boolean)
  const employees = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      isCoworker: false,
      ...(userIds?.length ? { id: { in: userIds } } : {}),
    },
    select: { id: true, name: true },
  })

  const issued: WarningCheckResult[] = []

  for (const emp of employees) {
    const attendances = await prisma.attendance.findMany({
      where: { userId: emp.id, date: { gte: startDate, lte: endDate } },
    })

    const lateCount = attendances.filter((a) => a.status === 'LATE').length
    const absentCount = attendances.filter((a) => a.status === 'ABSENT').length

    // Check if already warned this month
    const existingWarning = await prisma.warning.findFirst({
      where: { userId: emp.id, month, year, isAuto: true },
      select: { id: true },
    })
    if (existingWarning) continue

    // Find highest triggered rule
    let triggeredRule = null
    for (const rule of [...rules].reverse()) {
      const lateHit = rule.lateThreshold != null && lateCount >= rule.lateThreshold
      const absentHit = rule.absentThreshold != null && absentCount >= rule.absentThreshold
      if (lateHit || absentHit) {
        triggeredRule = rule
        break
      }
    }

    if (!triggeredRule) continue

    const reasons: string[] = []
    if (triggeredRule.lateThreshold && lateCount >= triggeredRule.lateThreshold) {
      reasons.push(`มาสาย ${lateCount} ครั้งในเดือนนี้`)
    }
    if (triggeredRule.absentThreshold && absentCount >= triggeredRule.absentThreshold) {
      reasons.push(`ขาดงาน ${absentCount} วันในเดือนนี้`)
    }
    const reason = reasons.join(' และ ')

    let warning: Awaited<ReturnType<typeof prisma.warning.create>>
    try {
      warning = await prisma.warning.create({
        data: {
          userId: emp.id,
          issuedById: emp.id, // system
          level: triggeredRule.level,
          reason,
          description: `ออกโดยระบบอัตโนมัติ เดือน ${month}/${year}`,
          isAuto: true,
          month,
          year,
          lineDeliveryStatus: 'pending',
        },
      })
    } catch (err) {
      // Racing against warning-auto.ts's checkin-triggered path for the same
      // user/month — the DB-level dedup index (warnings_auto_dedup_idx) rejected
      // this insert because the other path already won. Skip this employee.
      if ((err as { code?: string })?.code === 'P2002') continue
      throw err
    }

    const warningNumber = await prisma.warning.count({
      where: { userId: emp.id, createdAt: { lte: warning.createdAt } },
    })

    try {
      await deliverWarningToEmployee(warning.id, { warningNumber })
    } catch (e) {
      console.error('[warningEngine-line]', emp.id, e)
    }

    issued.push({
      userId: emp.id,
      name: emp.name,
      level: triggeredRule.level,
      reason,
      lateCount,
      absentCount,
    })
  }

  // Also notify HR/Manager
  if (issued.length > 0) {
    const managers = await prisma.user.findMany({
      where: { status: 'ACTIVE', role: { in: ['MANAGER_HR', 'ADMIN'] } },
      select: { id: true },
    })
    for (const mgr of managers) {
      await prisma.notification.create({
        data: {
          userId: mgr.id,
          type: 'WARNING_ISSUED',
          title: `ระบบออกใบเตือนอัตโนมัติ ${issued.length} คน`,
          message: issued.map((i) => `${i.name} (ระดับ ${i.level})`).join(', '),
          link: '/warnings',
        },
      })
    }
  }

  return issued
}
