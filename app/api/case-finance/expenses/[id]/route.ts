import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { parsePositiveAmount } from '@/lib/utils'
import { canApproverActOnRequester } from '@/lib/org-scope'
import type { Role } from '@prisma/client'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']
const CAN_VIEW   = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
const sel = { id: true, name: true, department: true }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_VIEW.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await params
    const item = await prisma.caseExpense.findUnique({
      where: { id },
      include: { employee: { select: sel }, createdBy: { select: sel } },
    })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // A MANAGER/TEAM_LEADER's own reimbursement (employeeId === themselves)
    // must also be viewable/editable by them — canApproverActOnRequester
    // only checks the direct-reports list, not self.
    const inScope = item.employeeId === session.user.id ||
      await canApproverActOnRequester(prisma, session.user.id, session.user.role as Role, item.employeeId)
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json(item)
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await params
    const existing = await prisma.caseExpense.findUnique({ where: { id }, select: { employeeId: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const inScope = existing.employeeId === session.user.id ||
      await canApproverActOnRequester(prisma, session.user.id, session.user.role as Role, existing.employeeId)
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json()
    const { expenseType, amount, date, note, department, caseNumber, taskId, receiptUrl, employeeId } = body

    let validAmount: number | undefined
    if (amount !== undefined) {
      const parsed = parsePositiveAmount(amount)
      if (parsed == null) {
        return NextResponse.json({ error: 'จำนวนเงินต้องมากกว่า 0' }, { status: 400 })
      }
      validAmount = parsed
    }

    const item = await prisma.caseExpense.update({
      where: { id },
      data: {
        ...(expenseType !== undefined && { expenseType }),
        ...(validAmount !== undefined && { amount: validAmount }),
        ...(date       !== undefined && { date: new Date(date) }),
        ...(note       !== undefined && { note }),
        ...(department !== undefined && { department }),
        ...(caseNumber !== undefined && { caseNumber }),
        ...(taskId     !== undefined && { taskId: taskId || null }),
        ...(receiptUrl !== undefined && { receiptUrl }),
        ...(employeeId !== undefined && { employeeId }),
      },
      include: { employee: { select: sel }, createdBy: { select: sel } },
    })
    return NextResponse.json(item)
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await params
    const existing = await prisma.caseExpense.findUnique({ where: { id }, select: { employeeId: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const inScope = existing.employeeId === session.user.id ||
      await canApproverActOnRequester(prisma, session.user.id, session.user.role as Role, existing.employeeId)
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await prisma.caseExpense.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
