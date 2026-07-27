import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { parsePositiveAmount } from '@/lib/utils'
import { canApproverActOnRequester } from '@/lib/org-scope'
import type { Role } from '@prisma/client'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']
const CAN_VIEW   = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAN_VIEW.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await params
    const income = await prisma.caseIncome.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, name: true } } },
    })
    if (!income) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // A MANAGER/TEAM_LEADER's own recorded income (createdById === themselves)
    // must also be viewable/editable by them — canApproverActOnRequester
    // only checks the direct-reports list, not self.
    const inScope = income.createdById === session.user.id ||
      await canApproverActOnRequester(prisma, session.user.id, session.user.role as Role, income.createdById)
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json(income)
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
    const existing = await prisma.caseIncome.findUnique({ where: { id }, select: { createdById: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const inScope = existing.createdById === session.user.id ||
      await canApproverActOnRequester(prisma, session.user.id, session.user.role as Role, existing.createdById)
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json()
    const { incomeType, amount, date, note, department, caseNumber, clientName, taskId } = body

    let validAmount: number | undefined
    if (amount !== undefined) {
      const parsed = parsePositiveAmount(amount)
      if (parsed == null) {
        return NextResponse.json({ error: 'จำนวนเงินต้องมากกว่า 0' }, { status: 400 })
      }
      validAmount = parsed
    }

    const income = await prisma.caseIncome.update({
      where: { id },
      data: {
        ...(incomeType  !== undefined && { incomeType }),
        ...(validAmount !== undefined && { amount: validAmount }),
        ...(date        !== undefined && { date: new Date(date) }),
        ...(note        !== undefined && { note }),
        ...(department  !== undefined && { department }),
        ...(caseNumber  !== undefined && { caseNumber }),
        ...(clientName  !== undefined && { clientName }),
        ...(taskId      !== undefined && { taskId: taskId || null }),
      },
      include: { createdBy: { select: { id: true, name: true } } },
    })
    return NextResponse.json(income)
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
    const existing = await prisma.caseIncome.findUnique({ where: { id }, select: { createdById: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const inScope = existing.createdById === session.user.id ||
      await canApproverActOnRequester(prisma, session.user.id, session.user.role as Role, existing.createdById)
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await prisma.caseIncome.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
