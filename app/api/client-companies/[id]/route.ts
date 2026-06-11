import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CAN_DELETE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR']
const userSel    = { id: true, name: true, department: true, role: true }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const company = await prisma.clientCompany.findUnique({
    where: { id },
    include: {
      createdBy:  { select: userSel },
      contracts: {
        include: {
          createdBy: { select: userSel },
          files:     true,
        },
        orderBy: { endDate: 'asc' },
      },
      slaRecords: {
        include: { createdBy: { select: userSel } },
        orderBy: { createdAt: 'desc' },
        take:    50,
      },
      files: {
        include: { createdBy: { select: userSel } },
        orderBy: { createdAt: 'desc' },
      },
      tasks: {
        include: {
          assignee:  { select: userSel },
          assignedBy: { select: userSel },
        },
        orderBy: { updatedAt: 'desc' },
        take:    30,
      },
    },
  })

  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Aggregate revenue from CaseIncome linked to this company's tasks
  const taskIds = company.tasks.map((t) => t.id)
  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.caseIncome.aggregate({
      where: taskIds.length > 0 ? { taskId: { in: taskIds } } : { clientName: company.companyName },
      _sum: { amount: true },
    }),
    prisma.caseExpense.aggregate({
      where: taskIds.length > 0 ? { taskId: { in: taskIds } } : { caseNumber: { contains: company.clientCode } },
      _sum: { amount: true },
    }),
  ])

  return NextResponse.json({
    ...company,
    _revenue: {
      income:  incomeAgg._sum.amount  ?? 0,
      expense: expenseAgg._sum.amount ?? 0,
      profit:  (incomeAgg._sum.amount ?? 0) - (expenseAgg._sum.amount ?? 0),
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id }  = await params
  const body    = await req.json()

  const allowed = ['companyName', 'contactName', 'phone', 'email', 'lineId',
                   'address', 'taxId', 'clientType', 'status', 'creditLimit',
                   'startDate', 'endDate', 'note']

  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) {
      if (['startDate', 'endDate'].includes(key)) {
        data[key] = body[key] ? new Date(body[key]) : null
      } else if (key === 'creditLimit') {
        data[key] = body[key] !== '' && body[key] != null ? Number(body[key]) : null
      } else {
        data[key] = body[key] === '' ? null : body[key]
      }
    }
  }

  const company = await prisma.clientCompany.update({
    where: { id },
    data,
    include: {
      createdBy: { select: { id: true, name: true, role: true, department: true } },
      _count:    { select: { contracts: true, tasks: true } },
    },
  })

  return NextResponse.json(company)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_DELETE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await prisma.clientCompany.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
