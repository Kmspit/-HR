import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']
const CAN_VIEW   = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

const userSelect = { id: true, name: true, department: true }

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_VIEW.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q          = searchParams.get('q') ?? ''
  const department = searchParams.get('department') ?? ''
  const from       = searchParams.get('from')
  const to         = searchParams.get('to')
  const page       = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit      = 50

  const where: Record<string, unknown> = {}
  if (q) {
    where.OR = [
      { caseNumber:  { contains: q } },
      { expenseType: { contains: q } },
      { note:        { contains: q } },
    ]
  }
  if (department) where.department = department
  if (from || to) {
    where.date = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    }
  }

  const [items, total] = await Promise.all([
    prisma.caseExpense.findMany({
      where,
      include: {
        employee:  { select: userSelect },
        createdBy: { select: userSelect },
      },
      orderBy: { date: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.caseExpense.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { taskId, caseNumber, expenseType, amount, date, employeeId, note, department, receiptUrl } = body

  if (!expenseType || !amount || !date || !employeeId) {
    return NextResponse.json({ error: 'expenseType, amount, date, employeeId required' }, { status: 400 })
  }

  const expense = await prisma.caseExpense.create({
    data: {
      taskId:      taskId || null,
      caseNumber:  caseNumber || null,
      expenseType,
      amount:      Number(amount),
      date:        new Date(date),
      employeeId,
      note:        note || null,
      department:  department || null,
      receiptUrl:  receiptUrl || null,
      createdById: session.user.id,
    },
    include: {
      employee:  { select: userSelect },
      createdBy: { select: userSelect },
    },
  })

  return NextResponse.json(expense, { status: 201 })
}
