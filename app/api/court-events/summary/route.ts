import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const EXEC_ROLES  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
const LEGAL_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER', 'ENFORCEMENT', 'TEAM_LEADER']

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!LEGAL_ROLES.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  function buildWhere(role: string, userId: string, department: string | null | undefined) {
    if (EXEC_ROLES.includes(role)) return {}
    if (role === 'MANAGER' && department) return { case: { department } }
    return { OR: [{ createdById: userId }, { assignedLawyerId: userId }] }
  }

  const accessWhere = buildWhere(session.user.role, session.user.id, session.user.department)

  const now        = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd   = new Date(todayStart.getTime() + 86_400_000 - 1)
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000)
  const tomorrowEnd   = new Date(tomorrowStart.getTime() + 86_400_000 - 1)
  const weekEnd    = new Date(todayStart.getTime() + 7 * 86_400_000 - 1)

  const [
    todayCount,
    tomorrowCount,
    weekCount,
    overdueCount,
    missedCount,
    criticalCount,
    byLawyer,
    recentMissed,
    upcoming7,
  ] = await Promise.all([
    prisma.courtEvent.count({
      where: { ...accessWhere, appointmentDate: { gte: todayStart, lte: todayEnd }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
    }),
    prisma.courtEvent.count({
      where: { ...accessWhere, appointmentDate: { gte: tomorrowStart, lte: tomorrowEnd }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
    }),
    prisma.courtEvent.count({
      where: { ...accessWhere, appointmentDate: { gte: todayStart, lte: weekEnd }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
    }),
    prisma.courtEvent.count({
      where: { ...accessWhere, appointmentDate: { lt: todayStart }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
    }),
    prisma.courtEvent.count({
      where: { ...accessWhere, status: 'MISSED' },
    }),
    prisma.courtEvent.count({
      where: { ...accessWhere, priority: 'CRITICAL', status: { in: ['SCHEDULED', 'CONFIRMED'] } },
    }),
    prisma.courtEvent.groupBy({
      by: ['assignedLawyerId'],
      where: { ...accessWhere, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
    prisma.courtEvent.findMany({
      where: { ...accessWhere, status: 'MISSED' },
      include: { case: { select: { caseNumber: true, caseTitle: true } }, assignedLawyer: { select: { id: true, name: true } } },
      orderBy: { appointmentDate: 'desc' },
      take: 5,
    }),
    prisma.courtEvent.findMany({
      where: { ...accessWhere, appointmentDate: { gte: todayStart, lte: weekEnd }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
      include: { case: { select: { caseNumber: true, caseTitle: true } }, assignedLawyer: { select: { id: true, name: true } } },
      orderBy: [{ priority: 'asc' }, { appointmentDate: 'asc' }],
      take: 10,
    }),
  ])

  // Resolve lawyer names for groupBy result
  const lawyerIds = byLawyer.map(r => r.assignedLawyerId).filter(Boolean) as string[]
  const lawyers = lawyerIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: lawyerIds } }, select: { id: true, name: true } })
    : []
  const lawyerMap = Object.fromEntries(lawyers.map(l => [l.id, l.name]))

  const byLawyerMapped = byLawyer.map(r => ({
    lawyerId:   r.assignedLawyerId,
    lawyerName: r.assignedLawyerId ? (lawyerMap[r.assignedLawyerId] ?? 'Unknown') : 'ไม่ได้รับมอบหมาย',
    count:      r._count.id,
  }))

  return NextResponse.json({
    today:     todayCount,
    tomorrow:  tomorrowCount,
    thisWeek:  weekCount,
    overdue:   overdueCount,
    missed:    missedCount,
    critical:  criticalCount,
    byLawyer:  byLawyerMapped,
    recentMissed,
    upcoming7,
  })
}
