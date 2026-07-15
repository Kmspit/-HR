import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireActivePortalSession } from '@/lib/portal-session-guard'
import { apiError } from '@/lib/api-handler'

export async function GET(req: NextRequest) {
 try {
  const portal = await requireActivePortalSession(req)
  if (!portal.ok) {
    return NextResponse.json({ error: portal.error }, { status: portal.status })
  }
  const { clientCompanyId } = portal.session
  const url   = new URL(req.url)
  const from  = url.searchParams.get('from')
  const to    = url.searchParams.get('to')

  const now   = new Date()
  const start = from ? new Date(from) : now
  const end   = to   ? new Date(to)   : new Date(now.getTime() + 90 * 86400_000)

  const caseLinks = await prisma.caseClient.findMany({
    where:  { clientCompanyId },
    select: { caseId: true },
  })
  const caseIds = caseLinks.map((l) => l.caseId)

  if (caseIds.length === 0) {
    return NextResponse.json({ events: [] })
  }

  const events = await prisma.courtEvent.findMany({
    where: {
      caseId:          { in: caseIds },
      appointmentDate: { gte: start, lte: end },
      status:          { not: 'CANCELLED' },
    },
    orderBy: { appointmentDate: 'asc' },
    select: {
      id:              true,
      courtName:       true,
      courtType:       true,
      appointmentType: true,
      appointmentDate: true,
      appointmentTime: true,
      location:        true,
      status:          true,
      priority:        true,
      case: {
        select: { id: true, caseNumber: true, caseTitle: true },
      },
    },
  })

  void prisma.clientPortalLog.create({
    data: {
      portalUserId: portal.session.portalUserId,
      action:       'VIEW_CALENDAR',
      resourceType: 'CourtEvent',
      ipAddress:    req.headers.get('x-forwarded-for') ?? undefined,
    },
  }).catch(() => undefined)

  return NextResponse.json({
    events: events.map((ev) => ({
      ...ev,
      case: ev.case ? { id: ev.case.id, caseNumber: ev.case.caseNumber, title: ev.case.caseTitle } : null,
    })),
  })
} catch (err) {
  return apiError(err)
 }
}
