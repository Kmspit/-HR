import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getPortalSession } from '@/lib/portal-auth'

export async function GET(req: NextRequest) {
  const session = await getPortalSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientCompanyId } = session
  const url   = new URL(req.url)
  const page  = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const limit = 20

  const caseLinks = await prisma.caseClient.findMany({
    where:  { clientCompanyId },
    select: { caseId: true },
  })
  const caseIds = caseLinks.map((l) => l.caseId)

  if (caseIds.length === 0) {
    return NextResponse.json({ payments: [], promises: [], total: 0, page: 1, pages: 0 })
  }

  // Get debtorIds linked to these cases (via CaseDebtor)
  const caseDebtors = await prisma.caseDebtor.findMany({
    where:  { caseId: { in: caseIds }, debtorId: { not: null } },
    select: { debtorId: true },
  })
  const debtorIds = caseDebtors.map((d) => d.debtorId).filter(Boolean) as string[]

  const [payments, total, promises] = await Promise.all([
    prisma.recoveryPayment.findMany({
      where:   { caseId: { in: caseIds } },
      orderBy: { paymentDate: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      select: {
        id:          true,
        amount:      true,
        paymentDate: true,
        paymentType: true,
        status:      true,
        note:        true,
        case:        { select: { caseNumber: true, caseTitle: true } },
      },
    }),
    prisma.recoveryPayment.count({ where: { caseId: { in: caseIds } } }),
    debtorIds.length > 0
      ? prisma.promiseToPay.findMany({
          where:   { debtorId: { in: debtorIds }, status: { in: ['PENDING', 'PARTIALLY_KEPT'] } },
          orderBy: { promisedDate: 'asc' },
          take:    10,
          select: {
            id:            true,
            promisedAmount: true,
            promisedDate:   true,
            status:         true,
            debtor:         { select: { debtorNumber: true } },
          },
        })
      : Promise.resolve([]),
  ])

  void prisma.clientPortalLog.create({
    data: {
      portalUserId: session.portalUserId,
      action:       'VIEW_RECOVERY',
      resourceType: 'RecoveryPayment',
      ipAddress:    req.headers.get('x-forwarded-for') ?? undefined,
    },
  }).catch(() => undefined)

  return NextResponse.json({
    payments: payments.map((p) => ({
      ...p,
      case: p.case ? { caseNumber: p.case.caseNumber, title: p.case.caseTitle } : null,
    })),
    promises,
    total,
    page,
    pages: Math.ceil(total / limit),
  })
}
