import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireActivePortalSession } from '@/lib/portal-session-guard'
import { apiError } from '@/lib/api-handler'

export async function GET(req: NextRequest) {
 try {
  // --- Portal JWT auth (new) ---
  const portalSession = await requireActivePortalSession(req)
  if (portalSession.ok) {
    return handlePortalRequest(req, portalSession.session.clientCompanyId, portalSession.session.portalUserId)
  }

  // --- Legacy CLIENT role via NextAuth (backward compat) ---
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const q      = searchParams.get('q')?.trim()
  const status = searchParams.get('status')
  const clientId = session.user.id

  const where: Record<string, unknown> = { clientId }
  if (status) where.status = status
  if (q) {
    where.OR = [
      { title:      { contains: q } },
      { caseNumber: { contains: q } },
      { clientName: { contains: q } },
    ]
  }

  const tasks = await prisma.taskAssignment.findMany({
    where,
    include: {
      assignee:        { select: { id: true, name: true, position: true } },
      assignedBy:      { select: { id: true, name: true } },
      attachments:     { select: { id: true, fileName: true, fileUrl: true, fileType: true }, take: 3 },
      statusHistories: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const total     = tasks.length
  const active    = tasks.filter((t) => !['COMPLETED', 'OVERDUE'].includes(t.status)).length
  const completed = tasks.filter((t) => t.status === 'COMPLETED').length
  const upcoming  = tasks.filter((t) => {
    if (!t.courtDate) return false
    const d   = new Date(t.courtDate)
    const now = new Date()
    return d >= now && d <= new Date(now.getTime() + 30 * 86400_000)
  }).length

  return NextResponse.json({ tasks, summary: { total, active, completed, upcoming } })
} catch (err) {
  return apiError(err)
 }
}

async function handlePortalRequest(
  req: NextRequest,
  clientCompanyId: string,
  portalUserId: string,
) {
  const url    = new URL(req.url)
  const status = url.searchParams.get('status') ?? undefined
  const page   = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const limit  = 20

  const where: Record<string, unknown> = { caseClient: { clientCompanyId } }
  if (status) where.status = status

  const [cases, total] = await Promise.all([
    prisma.case.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      select: {
        id:           true,
        caseNumber:   true,
        caseTitle:    true,
        status:       true,
        caseType:     true,
        priority:     true,
        createdAt:    true,
        updatedAt:    true,
        debtAmount:   true,
        debtor: {
          select: { id: true, fullName: true, riskLevel: true },
        },
        assignedEmployee: { select: { id: true, name: true } },
        _count:           { select: { courtEvents: true } },
      },
    }),
    prisma.case.count({ where }),
  ])

  void prisma.clientPortalLog.create({
    data: {
      portalUserId,
      action:       'VIEW_CASES',
      resourceType: 'Case',
      ipAddress:    req.headers.get('x-forwarded-for') ?? undefined,
    },
  }).catch(() => undefined)

  return NextResponse.json({ cases, total, page, pages: Math.ceil(total / limit) })
}
