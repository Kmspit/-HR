import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']
const CAN_VIEW   = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

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
      { clientName:  { contains: q } },
      { note:        { contains: q } },
      { incomeType:  { contains: q } },
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
    prisma.caseIncome.findMany({
      where,
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.caseIncome.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { taskId, caseNumber, clientName, incomeType, amount, date, note, department } = body

  if (!incomeType || !amount || !date) {
    return NextResponse.json({ error: 'incomeType, amount, date required' }, { status: 400 })
  }

  const income = await prisma.caseIncome.create({
    data: {
      taskId:      taskId || null,
      caseNumber:  caseNumber || null,
      clientName:  clientName || null,
      incomeType,
      amount:      Number(amount),
      date:        new Date(date),
      note:        note || null,
      department:  department || null,
      createdById: session.user.id,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  })

  void createNotification({
    userId:  session.user.id,
    type:    'SYSTEM',
    title:   'บันทึกรายรับคดีแล้ว',
    message: `${incomeType} — ${Number(amount).toLocaleString('th-TH')} บาท${caseNumber ? ` (คดี ${caseNumber})` : ''}`,
  })

  return NextResponse.json(income, { status: 201 })
}
