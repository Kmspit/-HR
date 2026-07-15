import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']
const userSel = { id: true, name: true, department: true, role: true }

export async function GET(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const type   = searchParams.get('type') ?? ''
  const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit  = 50

  const where: Record<string, unknown> = {}
  if (q) {
    where.OR = [
      { companyName: { contains: q } },
      { clientCode:  { contains: q } },
      { contactName: { contains: q } },
      { phone:       { contains: q } },
      { email:       { contains: q } },
      { taxId:       { contains: q } },
    ]
  }
  if (status) where.status = status
  if (type)   where.clientType = type

  const [items, total] = await Promise.all([
    prisma.clientCompany.findMany({
      where,
      include: {
        createdBy: { select: userSel },
        _count:    { select: { contracts: true, tasks: true, slaRecords: true } },
        contracts: {
          where:   { status: 'ACTIVE' },
          orderBy: { endDate: 'asc' },
          take:    1,
          select:  { endDate: true, value: true, status: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.clientCompany.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) })
} catch (err) {
  return apiError(err)
 }
}

export async function POST(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { companyName, contactName, phone, email, lineId, address, taxId,
          clientType, status, creditLimit, startDate, endDate, note } = body

  if (!companyName) return NextResponse.json({ error: 'companyName required' }, { status: 400 })

  const count = await prisma.clientCompany.count()
  const year  = new Date().getFullYear()
  const clientCode = `CLT-${year}-${String(count + 1).padStart(4, '0')}`

  const company = await prisma.clientCompany.create({
    data: {
      clientCode,
      companyName,
      contactName:  contactName  || null,
      phone:        phone        || null,
      email:        email        || null,
      lineId:       lineId       || null,
      address:      address      || null,
      taxId:        taxId        || null,
      clientType:   clientType   || 'CORPORATE',
      status:       status       || 'ACTIVE',
      creditLimit:  creditLimit  ? Number(creditLimit) : null,
      startDate:    startDate    ? new Date(startDate) : null,
      endDate:      endDate      ? new Date(endDate)   : null,
      note:         note         || null,
      createdById:  session.user.id,
    },
    include: {
      createdBy: { select: userSel },
      _count:    { select: { contracts: true, tasks: true, slaRecords: true } },
    },
  })

  return NextResponse.json(company, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
