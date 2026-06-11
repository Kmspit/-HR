import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const income = await prisma.caseIncome.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, name: true } } },
  })
  if (!income) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(income)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  const { incomeType, amount, date, note, department, caseNumber, clientName, taskId } = body

  const income = await prisma.caseIncome.update({
    where: { id },
    data: {
      ...(incomeType  !== undefined && { incomeType }),
      ...(amount      !== undefined && { amount: Number(amount) }),
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
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await prisma.caseIncome.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
