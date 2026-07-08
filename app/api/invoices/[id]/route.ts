import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const userSel = { id: true, name: true, role: true, department: true }
const FINANCE_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const invoice = await prisma.billingInvoice.findUnique({
    where: { id },
    include: {
      clientCompany: { select: { id: true, clientCode: true, companyName: true, taxId: true, address: true } },
      task:          { select: { id: true, title: true, caseNumber: true } },
      createdBy:     { select: userSel },
      approvedBy:    { select: userSel },
      payments: {
        include: { receivedBy: { select: userSel }, createdBy: { select: userSel } },
        orderBy: { paidAt: 'asc' },
      },
      receipts: {
        include: { createdBy: { select: userSel } },
        orderBy: { issuedAt: 'asc' },
      },
    },
  })

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(invoice)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!FINANCE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body   = await req.json()

  const allowed = [
    'clientName', 'clientTaxId', 'clientAddress', 'serviceType', 'lineItems',
    'subtotal', 'vatRate', 'whtRate', 'issueDate', 'dueDate', 'note', 'status',
  ]
  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (!(key in body)) continue
    if (key === 'lineItems') {
      data[key] = JSON.stringify(body[key])
    } else if (['issueDate', 'dueDate'].includes(key)) {
      data[key] = body[key] ? new Date(body[key]) : null
    } else if (['subtotal', 'vatRate', 'whtRate'].includes(key)) {
      data[key] = Number(body[key])
    } else {
      data[key] = body[key] === '' ? null : body[key]
    }
  }

  // Recalculate amounts if financial fields changed
  if ('subtotal' in data || 'vatRate' in data || 'whtRate' in data) {
    const existing = await prisma.billingInvoice.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const sub    = Number(data.subtotal  ?? existing.subtotal)
    const vatR   = Number(data.vatRate   ?? existing.vatRate)
    const whtR   = Number(data.whtRate   ?? existing.whtRate)
    data.vatAmount  = Math.round(sub * vatR * 100) / 100
    data.whtAmount  = Math.round(sub * whtR * 100) / 100
    data.totalAmount = sub + (data.vatAmount as number) - (data.whtAmount as number)
    data.remainingAmount = (data.totalAmount as number) - existing.paidAmount
  }

  // Approve action
  if (body.status === 'SENT' && !body._noApproval) {
    data.approvedById = session.user.id
    data.approvedAt   = new Date()
  }

  const invoice = await prisma.billingInvoice.update({
    where: { id },
    data,
    include: {
      clientCompany: { select: { id: true, clientCode: true, companyName: true } },
      createdBy:     { select: userSel },
      approvedBy:    { select: userSel },
    },
  })

  return NextResponse.json(invoice)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await prisma.billingInvoice.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
