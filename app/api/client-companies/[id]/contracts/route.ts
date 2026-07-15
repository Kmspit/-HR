import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

const userSel = { id: true, name: true, department: true, role: true }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const contracts = await prisma.clientContract.findMany({
    where: { clientCompanyId: id },
    include: {
      createdBy:  { select: userSel },
      files:      true,
      slaRecords: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
    orderBy: { endDate: 'asc' },
  })
  return NextResponse.json(contracts)
} catch (err) {
  return apiError(err)
 }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id }   = await params
  const body     = await req.json()
  const { serviceType, startDate, endDate, value, slaAgreement, paymentTerms, note } = body

  if (!serviceType || !startDate || !endDate) {
    return NextResponse.json({ error: 'serviceType, startDate, endDate required' }, { status: 400 })
  }

  const count   = await prisma.clientContract.count()
  const year    = new Date().getFullYear()
  const contractNumber = `CTR-${year}-${String(count + 1).padStart(4, '0')}`

  const contract = await prisma.clientContract.create({
    data: {
      clientCompanyId: id,
      contractNumber,
      serviceType,
      startDate:    new Date(startDate),
      endDate:      new Date(endDate),
      value:        Number(value ?? 0),
      slaAgreement: slaAgreement || null,
      paymentTerms: paymentTerms || null,
      note:         note         || null,
      createdById:  session.user.id,
    },
    include: {
      createdBy: { select: userSel },
      files:     true,
    },
  })

  return NextResponse.json(contract, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
