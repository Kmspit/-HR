import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { triggerAutomation } from '@/lib/automation-engine'

const CAN_CONFIRM = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
// Same company-wide visibility set as the sibling list endpoint
// (app/api/recovery/payments/route.ts) — everyone else is scoped to payments
// they personally collected.
const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER', 'LAWYER', 'ENFORCEMENT']
const LARGE_THRESHOLD = 50000

const userSel = { id: true, name: true, department: true, role: true }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const payment = await prisma.recoveryPayment.findUnique({
    where: { id },
    include: {
      debtor:    { select: { id: true, debtorNumber: true, firstName: true, lastName: true, paidAmount: true, remainingDebt: true } },
      collector: { select: userSel },
      createdBy: { select: userSel },
      promise:   { select: { id: true, promisedAmount: true, promisedDate: true, status: true } },
      case:      { select: { id: true, caseNumber: true, caseTitle: true } },
      client:    { select: { id: true, clientCode: true, companyName: true } },
    },
  })
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!CAN_MANAGE.includes(session.user.role) && payment.collectorId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json(payment)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id }     = await params
  const { status, note, referenceNumber } = await req.json()

  const payment = await prisma.recoveryPayment.findUnique({
    where: { id },
    include: { promise: true },
  })
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Confirming requires elevated role
  if (status === 'CONFIRMED' && !CAN_CONFIRM.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Confirming a payment fires one-time side effects (debtor balance, case
  // financials, notifications, automation) that must never fire twice for one
  // payment. A plain read-then-update lets two concurrent confirms both see
  // "not yet confirmed" and both run the side-effect block. Gate the CONFIRMED
  // transition on an atomic compare-and-swap instead: only the request that
  // actually flips status away from CONFIRMED wins the race.
  let isNewlyConfirmed = false
  if (status === 'CONFIRMED') {
    const result = await prisma.recoveryPayment.updateMany({
      where: { id, status: { not: 'CONFIRMED' } },
      data: {
        status,
        note:            note            ?? payment.note,
        referenceNumber: referenceNumber ?? payment.referenceNumber,
      },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: 'การชำระเงินนี้ถูกยืนยันไปแล้ว' }, { status: 409 })
    }
    isNewlyConfirmed = true
  } else {
    await prisma.recoveryPayment.update({
      where: { id },
      data: {
        status,
        note:            note            ?? payment.note,
        referenceNumber: referenceNumber ?? payment.referenceNumber,
      },
    })
  }

  const updated = await prisma.recoveryPayment.findUniqueOrThrow({ where: { id } })

  if (isNewlyConfirmed) {
    // 1. Update debtor debt balance
    await prisma.debtor.update({
      where: { id: payment.debtorId },
      data: {
        paidAmount:   { increment: payment.amount },
        remainingDebt: { decrement: payment.amount },
      },
    })

    // 2. Update promise status if linked
    if (payment.promiseId && payment.promise) {
      const promisedAmt = payment.promise.promisedAmount
      const newStatus = payment.amount >= promisedAmt ? 'KEPT' : 'PARTIALLY_KEPT'
      await prisma.promiseToPay.update({
        where: { id: payment.promiseId },
        data: { status: newStatus },
      })
    }

    // 3. Update case financial if caseId linked — upsert so collectedAmount is
    // reliably tracked here even if no one has opened the case's Finance tab yet
    // (collectedAmount is derived exclusively from confirmed payments; it must
    // never silently no-op just because the CaseFinancial row didn't exist).
    if (payment.caseId) {
      await prisma.caseFinancial.upsert({
        where: { caseId: payment.caseId },
        create: {
          caseId:          payment.caseId,
          collectedAmount: payment.amount,
          updatedById:     session.user.id,
        },
        update: {
          collectedAmount: { increment: payment.amount },
          updatedById:     session.user.id,
        },
      })
      await prisma.case.update({
        where: { id: payment.caseId },
        data: { collectedAmount: { increment: payment.amount } },
      })
    }

    // 4. Large payment notification
    if (payment.amount >= LARGE_THRESHOLD) {
      const managers = await prisma.user.findMany({
        where: { role: { in: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'MANAGER'] }, status: 'ACTIVE' },
        select: { id: true },
      })
      const debtor = await prisma.debtor.findUnique({
        where: { id: payment.debtorId },
        select: { firstName: true, lastName: true },
      })
      await prisma.notification.createMany({
        data: managers.map(m => ({
          userId:  m.id,
          type:    'SYSTEM',
          title:   `💰 การชำระเงินรายใหญ่ ฿${payment.amount.toLocaleString('th-TH')}`,
          message: `${debtor?.firstName ?? ''} ${debtor?.lastName ?? ''} ชำระ ฿${payment.amount.toLocaleString('th-TH')} — ยืนยันโดย ${session.user.name}`,
          link:    '/recovery',
        })),
      })
    }

    // 5. Check repeated broken promises → escalate risk
    const brokenCount = await prisma.promiseToPay.count({
      where: { debtorId: payment.debtorId, status: 'BROKEN' },
    })
    if (brokenCount >= 3) {
      await prisma.debtor.update({
        where: { id: payment.debtorId },
        data: { riskLevel: 'CRITICAL' },
      })
    } else if (brokenCount >= 2) {
      const d = await prisma.debtor.findUnique({ where: { id: payment.debtorId }, select: { riskLevel: true } })
      if (d?.riskLevel === 'LOW' || d?.riskLevel === 'MEDIUM') {
        await prisma.debtor.update({ where: { id: payment.debtorId }, data: { riskLevel: 'HIGH' } })
      }
    }
  }

  // Fire automation triggers (non-blocking)
  if (isNewlyConfirmed) {
    const debtorSnap = await prisma.debtor.findUnique({
      where: { id: payment.debtorId },
      select: { id: true, debtorNumber: true, firstName: true, lastName: true, remainingDebt: true, riskLevel: true, assignedToId: true },
    })
    const triggerData = {
      paymentId:    payment.id,
      debtorId:     payment.debtorId,
      debtorNumber: debtorSnap?.debtorNumber,
      debtorName:   `${debtorSnap?.firstName ?? ''} ${debtorSnap?.lastName ?? ''}`,
      amount:       payment.amount,
      paymentType:  payment.paymentType,
      caseId:       payment.caseId,
      collectorId:  payment.collectorId,
      remainingDebt: debtorSnap?.remainingDebt ?? 0,
      riskLevel:    debtorSnap?.riskLevel,
      assignedToId: debtorSnap?.assignedToId,
    }
    triggerAutomation('PAYMENT_CONFIRMED', triggerData, session.user.id).catch(() => undefined)
  }

  return NextResponse.json(updated)
}
