import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const HR_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: userId, role } = session.user

  const isSenior = HR_ROLES.includes(role)

  // Base where clause for "items I need to act on"
  const myActionWhere = isSenior
    ? {
        status: { notIn: ['CEO_APPROVED', 'APPROVED', 'REJECTED'] },
      }
    : {
        steps: {
          some: {
            status: 'PENDING',
            OR: [{ approverId: userId }, { approverRole: role }],
          },
        },
      }

  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    totalPending,
    urgentCount,
    highValueCount,
    rejectedToday,
    recentPending,
    byType,
    pendingSignatures,
    recentActivity,
  ] = await Promise.all([
    prisma.approvalRequest.count({
      where: { ...myActionWhere },
    }),
    prisma.approvalRequest.count({
      where: { ...myActionWhere, priority: 'URGENT' },
    }),
    prisma.approvalRequest.count({
      where: { ...myActionWhere, amount: { gte: 50000 } },
    }),
    prisma.approvalRequest.count({
      where: {
        status: 'REJECTED',
        updatedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.approvalRequest.findMany({
      where: myActionWhere,
      include: {
        requestedBy: { select: { name: true, role: true } },
        steps: {
          where: { status: 'PENDING' },
          take: 1,
          orderBy: { stepOrder: 'asc' },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    }),
    prisma.approvalRequest.groupBy({
      by: ['docType'],
      where: myActionWhere,
      _count: { id: true },
    }),
    prisma.digitalSignature.count({
      where: {
        signedById: userId,
        createdAt:  { gte: start },
      },
    }),
    prisma.activityLog.findMany({
      where: isSenior ? {} : { actorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
  ])

  return NextResponse.json({
    totalPending,
    urgentCount,
    highValueCount,
    rejectedToday,
    recentPending,
    byType: byType.map((b) => ({ docType: b.docType, count: b._count.id })),
    pendingSignatures,
    recentActivity,
  })
}
