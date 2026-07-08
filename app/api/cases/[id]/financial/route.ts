import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

const EXEC_ROLES  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
const EDIT_ROLES  = [...EXEC_ROLES, 'MANAGER', 'LAWYER', 'ENFORCEMENT']

async function canAccess(caseId: string, userId: string, role: string, department?: string | null) {
  if (EXEC_ROLES.includes(role)) return true
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { createdById: true, assignedEmployeeId: true, department: true } })
  if (!c) return false
  if (role === 'MANAGER' && department && c.department === department) return true
  return c.createdById === userId || c.assignedEmployeeId === userId
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  if (!await canAccess(id, session.user.id, session.user.role, session.user.department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [c, financial] = await Promise.all([
    prisma.case.findUnique({ where: { id }, select: { debtAmount: true, collectedAmount: true, legalFee: true, courtFee: true, enforcementFee: true } }),
    prisma.caseFinancial.findUnique({ where: { caseId: id }, include: { updatedBy: { select: { id: true, name: true } } } }),
  ])
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ financial, case: c })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  if (!EDIT_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขข้อมูลการเงิน' }, { status: 403 })
  }
  if (!await canAccess(id, session.user.id, session.user.role, session.user.department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  // collectedAmount is intentionally NOT accepted here — it must only ever
  // change via a CONFIRMED RecoveryPayment (see app/api/recovery/payments/[id]/route.ts),
  // which increments both CaseFinancial.collectedAmount and Case.collectedAmount
  // from a real payment record. Accepting it as a direct client value here would
  // let it be set to an arbitrary number with no payment behind it.
  const { debtAmount, legalFee, courtFee, enforcementFee, otherFee } = body

  const financial = await prisma.caseFinancial.upsert({
    where: { caseId: id },
    create: {
      caseId: id,
      debtAmount:      debtAmount      != null ? Number(debtAmount)      : 0,
      legalFee:        legalFee        != null ? Number(legalFee)        : 0,
      courtFee:        courtFee        != null ? Number(courtFee)        : 0,
      enforcementFee:  enforcementFee  != null ? Number(enforcementFee)  : 0,
      otherFee:        otherFee        != null ? Number(otherFee)        : 0,
      updatedById:     session.user.id,
    },
    update: {
      ...(debtAmount      != null && { debtAmount:      Number(debtAmount) }),
      ...(legalFee        != null && { legalFee:        Number(legalFee) }),
      ...(courtFee        != null && { courtFee:        Number(courtFee) }),
      ...(enforcementFee  != null && { enforcementFee:  Number(enforcementFee) }),
      ...(otherFee        != null && { otherFee:        Number(otherFee) }),
      updatedById: session.user.id,
    },
  })

  await prisma.caseTimeline.create({
    data: {
      caseId:      id,
      userId:      session.user.id,
      action:      'financial_updated',
      description: `${session.user.name} อัปเดตข้อมูลการเงิน`,
      meta:        JSON.stringify({ legalFee, courtFee, enforcementFee }),
    },
  })

  return NextResponse.json({ financial })
}
