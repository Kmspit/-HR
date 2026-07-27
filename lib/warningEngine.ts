import { prisma } from '@/lib/prisma'

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

    // Check if already warned this month (either path — warning-auto.ts's
    // checkin-triggered path always issues level 1 off late-count alone, for
    // fast real-time feedback; this cron re-evaluates against the full
    // WarningRule table below, so a same-month row here isn't necessarily
    // final — see the upgrade step further down).
    const existingWarning = await prisma.warning.findFirst({
      where: { userId: emp.id, month, year, isAuto: true },
      select: { id: true, level: true, status: true },
    })

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

    if (existingWarning) {
      // Only upgrade a warning that's still awaiting review — an already
      // APPROVED/REJECTED/ARCHIVED row has taken effect (or been decided)
      // and must not be silently rewritten under it. Only upgrade, never
      // downgrade, so a later re-run with fewer counted days can't undo an
      // already-higher level someone is reviewing.
      const canUpgrade =
        existingWarning.status === 'PENDING_APPROVAL' && triggeredRule.level > existingWarning.level
      if (!canUpgrade) continue

      // Compare-and-swap on status: a human could approve/reject this exact
      // row between the read above and this write (same guard pattern as the
      // APPROVE/REJECT actions in app/api/warnings/[id]/route.ts). If it's no
      // longer PENDING_APPROVAL by the time we write, leave it alone.
      const result = await prisma.warning.updateMany({
        where: { id: existingWarning.id, status: 'PENDING_APPROVAL' },
        data: {
          level: triggeredRule.level,
          reason,
          description: `ออกโดยระบบอัตโนมัติ เดือน ${month}/${year} (ปรับระดับจาก ${existingWarning.level} เป็น ${triggeredRule.level})`,
        },
      })
      if (result.count === 0) continue

      issued.push({
        userId: emp.id,
        name: emp.name,
        level: triggeredRule.level,
        reason,
        lateCount,
        absentCount,
      })
      continue
    }

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
          status: 'PENDING_APPROVAL',
          lineDeliveryStatus: 'pending',
        },
      })
    } catch (err) {
      // Racing against warning-auto.ts's checkin-triggered path (or another
      // concurrent cron invocation) for the same user/month — the DB-level
      // dedup index (warnings_auto_dedup_idx) rejected this insert because
      // another path already won. Skip this employee; the upgrade path above
      // will pick it up on the next run if it still qualifies for a higher level.
      if ((err as { code?: string })?.code === 'P2002') continue
      throw err
    }

    // Do NOT deliver to the employee here — the warning is PENDING_APPROVAL,
    // matching warning-auto.ts's checkin-triggered path. Delivering the LINE
    // notice + PDF now (before HR/CEO review) would give the warning effect
    // ahead of approval, which is exactly the bug this status fix closes.
    // The employee is notified via app/api/warnings/[id]/route.ts's APPROVE
    // action once a human actually approves it.

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
          title: `ระบบเสนอใบเตือนอัตโนมัติ ${issued.length} คน — รออนุมัติ`,
          message: issued.map((i) => `${i.name} (ระดับ ${i.level})`).join(', '),
          link: '/warnings',
        },
      })
    }
  }

  return issued
}
