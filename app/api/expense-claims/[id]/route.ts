import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePositiveAmount } from '@/lib/utils'
import { apiError } from '@/lib/api-handler'
import { logSecurityEvent } from '@/lib/security-events'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']
const sel = { id: true, name: true, department: true, role: true }

// Finalized — no field may be edited by anyone once a claim reaches one of
// these, even by management roles. Correcting a finalized claim (esp. one
// already PAID) must go through a reversal/new-claim process, not a silent
// in-place edit with no re-approval and no audit trail.
const LOCKED_STATUSES = ['CEO_APPROVED', 'PAID', 'REJECTED']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const claim = await prisma.expenseClaim.findUnique({
    where: { id },
    include: { submittedBy: { select: sel }, files: true },
  })
  if (!claim) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const userId = session.user.id
  const role   = session.user.role
  if (!CAN_MANAGE.includes(role) && claim.submittedById !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json(claim)
 } catch (err) {
  return apiError(err)
 }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const claim = await prisma.expenseClaim.findUnique({ where: { id } })
  if (!claim) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const userId = session.user.id
  const role   = session.user.role
  const isOwner = claim.submittedById === userId
  if (!CAN_MANAGE.includes(role) && !isOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Finalized claims are locked for everyone, including management roles —
  // log the blocked attempt as evidence, since a PAID/approved/rejected claim
  // being probed for edits is worth a record even though nothing changes.
  if (LOCKED_STATUSES.includes(claim.status)) {
    void logSecurityEvent({
      userId,
      eventType: 'SUSPICIOUS_ACTIVITY',
      severity: 'WARNING',
      description: `พยายามแก้ไขใบเบิกค่าใช้จ่ายที่ finalize แล้ว (สถานะ ${claim.status}) — claimId: ${claim.id}`,
      ip: req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
      metadata: { claimId: claim.id, claimStatus: claim.status, isOwner, attemptedChanges: body },
    })
    return NextResponse.json(
      { error: `ไม่สามารถแก้ไขได้ — ใบเบิกนี้ finalize แล้ว (สถานะ: ${claim.status})` },
      { status: 400 },
    )
  }

  // Owner (non-management) can only edit PENDING claims
  if (isOwner && !CAN_MANAGE.includes(role) && claim.status !== 'PENDING') {
    return NextResponse.json({ error: 'Cannot edit non-pending claim' }, { status: 400 })
  }

  const { title, expenseType, amount, date, note, caseNumber, taskId } = body

  let validAmount: number | undefined
  if (amount !== undefined) {
    const parsed = parsePositiveAmount(amount)
    if (parsed == null) {
      return NextResponse.json({ error: 'จำนวนเงินต้องมากกว่า 0' }, { status: 400 })
    }
    validAmount = parsed
  }

  const updated = await prisma.expenseClaim.update({
    where: { id },
    data: {
      ...(title       !== undefined && { title }),
      ...(expenseType !== undefined && { expenseType }),
      ...(validAmount !== undefined && { amount: validAmount }),
      ...(date        !== undefined && { date: new Date(date) }),
      ...(note        !== undefined && { note }),
      ...(caseNumber  !== undefined && { caseNumber }),
      ...(taskId      !== undefined && { taskId: taskId || null }),
    },
    include: { submittedBy: { select: sel }, files: true },
  })
  return NextResponse.json(updated)
 } catch (err) {
  return apiError(err)
 }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const claim = await prisma.expenseClaim.findUnique({ where: { id } })
  if (!claim) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const userId = session.user.id
  const role   = session.user.role
  if (!CAN_MANAGE.includes(role) && claim.submittedById !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (claim.status !== 'PENDING') {
    return NextResponse.json({ error: 'Can only delete PENDING claims' }, { status: 400 })
  }

  await prisma.expenseClaim.delete({ where: { id } })
  return NextResponse.json({ ok: true })
 } catch (err) {
  return apiError(err)
 }
}
