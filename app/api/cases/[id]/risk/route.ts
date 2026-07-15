import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'

const EXEC_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const c = await prisma.case.findUnique({
    where: { id },
    include: {
      debtor:          { select: { riskLevel: true } },
      courts:          { orderBy: { courtDate: 'asc' } },
      debtorActivities: { orderBy: { createdAt: 'desc' }, take: 1 },
      tasks:           { where: { status: { in: ['OVERDUE'] } }, select: { id: true } },
    },
  })
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canRecalc =
    EXEC_ROLES.includes(session.user.role) ||
    c.createdById === session.user.id ||
    c.assignedEmployeeId === session.user.id

  if (!canRecalc) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let score = 0
  const now = new Date()

  // Debt amount risk
  if (c.debtAmount && c.debtAmount >= 1_000_000) score += 3
  else if (c.debtAmount && c.debtAmount >= 100_000) score += 2
  else if (c.debtAmount && c.debtAmount > 0) score += 1

  // Overdue case (dueDate past)
  if (c.dueDate && c.dueDate < now) score += 3

  // Court date within 7 days
  const soonCourt = c.courts.find(co => {
    const diff = (co.courtDate.getTime() - now.getTime()) / 86400000
    return diff >= 0 && diff <= 7
  })
  if (soonCourt) score += 3

  // No debtor contact in 7 days
  const lastActivity = c.debtorActivities[0]
  if (!lastActivity) {
    score += 2
  } else {
    const daysSinceContact = (now.getTime() - lastActivity.createdAt.getTime()) / 86400000
    if (daysSinceContact > 14) score += 3
    else if (daysSinceContact > 7) score += 2
  }

  // Overdue tasks linked to this case
  if (c.tasks.length >= 3) score += 2
  else if (c.tasks.length >= 1) score += 1

  // Debtor risk level
  if (c.debtor?.riskLevel === 'HIGH')     score += 1
  if (c.debtor?.riskLevel === 'CRITICAL') score += 2

  // Priority CRITICAL
  if (c.priority === 'CRITICAL') score += 2

  const riskLevel =
    score >= 12 ? 'CRITICAL' :
    score >= 7  ? 'HIGH'     :
    score >= 3  ? 'MEDIUM'   : 'LOW'

  const oldRisk = c.riskLevel
  await prisma.case.update({ where: { id }, data: { riskLevel } })

  if (oldRisk !== riskLevel) {
    await prisma.caseTimeline.create({
      data: {
        caseId:      id,
        userId:      session.user.id,
        action:      'risk_changed',
        description: `ระบบประเมินความเสี่ยงใหม่: ${oldRisk} → ${riskLevel} (คะแนน: ${score})`,
        meta:        JSON.stringify({ oldRisk, newRisk: riskLevel, score }),
      },
    })
  }

  return NextResponse.json({ riskLevel, score, changed: oldRisk !== riskLevel })
} catch (err) {
  return apiError(err)
 }
}
