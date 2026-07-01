import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireActivePortalSession } from '@/lib/portal-session-guard'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const portal = await requireActivePortalSession(req)
  if (!portal.ok) {
    return NextResponse.json({ error: portal.error }, { status: portal.status })
  }
  const { id: caseId } = await params
  const { clientCompanyId } = portal.session

  const caseLink = await prisma.caseClient.findFirst({
    where: { caseId, clientCompanyId },
  })
  if (!caseLink) return NextResponse.json({ error: 'Not Found' }, { status: 404 })

  const caseData = await prisma.case.findUnique({
    where:  { id: caseId },
    select: {
      id:          true,
      caseNumber:  true,
      caseTitle:   true,
      status:      true,
      caseType:    true,
      priority:    true,
      description: true,
      debtAmount:  true,
      createdAt:   true,
      updatedAt:   true,
      debtor: {
        select: { id: true, fullName: true, riskLevel: true, phone: true, address: true },
      },
      assignedEmployee: { select: { id: true, name: true, phone: true } },
      timeline: {
        orderBy: { createdAt: 'desc' },
        take:    30,
        select: {
          id:          true,
          action:      true,
          description: true,
          createdAt:   true,
          user:        { select: { name: true } },
        },
      },
      courtEvents: {
        where:   { status: { not: 'CANCELLED' } },
        orderBy: { appointmentDate: 'asc' },
        select: {
          id:              true,
          courtName:       true,
          courtType:       true,
          appointmentType: true,
          appointmentDate: true,
          appointmentTime: true,
          status:          true,
          priority:        true,
          location:        true,
        },
      },
      recoveryPayments: {
        where:   { status: 'RECEIVED' },
        orderBy: { paymentDate: 'desc' },
        take:    20,
        select: {
          id:          true,
          amount:      true,
          paymentDate: true,
          paymentType: true,
          status:      true,
        },
      },
    },
  })

  if (!caseData) return NextResponse.json({ error: 'Not Found' }, { status: 404 })

  void prisma.clientPortalLog.create({
    data: {
      portalUserId: portal.session.portalUserId,
      action:       'VIEW_CASE',
      resourceType: 'Case',
      resourceId:   caseId,
      ipAddress:    req.headers.get('x-forwarded-for') ?? undefined,
    },
  }).catch(() => undefined)

  const recoveryTotal = caseData.recoveryPayments.reduce((sum, p) => sum + p.amount, 0)

  return NextResponse.json({ case: caseData, recoveryTotal })
}
