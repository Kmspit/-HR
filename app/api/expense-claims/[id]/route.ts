import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parsePositiveAmount } from '@/lib/utils'
import { apiError } from '@/lib/api-handler'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']
const sel = { id: true, name: true, department: true, role: true }

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
  // Owner can only edit PENDING claims
  if (isOwner && !CAN_MANAGE.includes(role) && claim.status !== 'PENDING') {
    return NextResponse.json({ error: 'Cannot edit non-pending claim' }, { status: 400 })
  }

  const body = await req.json()
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
