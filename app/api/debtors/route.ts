import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
const userSel = { id: true, name: true, department: true, role: true }

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit  = 50

  const where: Record<string, unknown> = {}
  if (q) {
    where.OR = [
      { firstName:    { contains: q } },
      { lastName:     { contains: q } },
      { debtorNumber: { contains: q } },
      { caseNumber:   { contains: q } },
      { phone:        { contains: q } },
      { nationalId:   { contains: q } },
    ]
  }
  if (status) where.status = status

  // Employees see only their assigned debtors
  const role   = session.user.role
  const userId = session.user.id
  if (!CAN_MANAGE.includes(role)) {
    where.assignedToId = userId
  }

  const [items, total] = await Promise.all([
    prisma.debtor.findMany({
      where,
      include: {
        assignedTo: { select: userSel },
        createdBy:  { select: userSel },
        _count:     { select: { followUps: true, payments: true, appointments: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.debtor.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    firstName, lastName, caseNumber, taskId, nationalId,
    phone, phone2, phone3, lineId, email, facebook,
    address, province, workplace, occupation, incomeEstimate,
    riskLevel, preferredContactTime, contactPreference, tags,
    workplaceAddress, registeredAddress, assetAddress,
    assignedToId, status, totalDebt, startDate, note,
  } = body

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'firstName and lastName are required' }, { status: 400 })
  }

  const count = await prisma.debtor.count()
  const year  = new Date().getFullYear()
  const debtorNumber = `DBT-${year}-${String(count + 1).padStart(4, '0')}`

  const total = Number(totalDebt ?? 0)

  const debtor = await prisma.debtor.create({
    data: {
      debtorNumber,
      caseNumber:          caseNumber          || null,
      taskId:              taskId              || null,
      firstName,
      lastName,
      nationalId:          nationalId          || null,
      phone:               phone               || null,
      phone2:              phone2              || null,
      phone3:              phone3              || null,
      lineId:              lineId              || null,
      email:               email               || null,
      facebook:            facebook            || null,
      address:             address             || null,
      province:            province            || null,
      workplace:           workplace           || null,
      occupation:          occupation          || null,
      incomeEstimate:      incomeEstimate ? Number(incomeEstimate) : null,
      riskLevel:           riskLevel           || 'MEDIUM',
      preferredContactTime: preferredContactTime || null,
      contactPreference:   contactPreference   || null,
      tags:                tags                || '[]',
      workplaceAddress:    workplaceAddress    || null,
      registeredAddress:   registeredAddress   || null,
      assetAddress:        assetAddress        || null,
      assignedToId:        assignedToId        || null,
      status:              status              || 'NEW',
      totalDebt:           total,
      remainingDebt:       total,
      startDate:           startDate ? new Date(startDate) : null,
      note:                note                || null,
      createdById:         session.user.id,
    },
    include: {
      assignedTo: { select: userSel },
      createdBy:  { select: userSel },
    },
  })

  return NextResponse.json(debtor, { status: 201 })
}
