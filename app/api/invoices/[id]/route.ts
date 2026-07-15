import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseNonNegativeNumber } from '@/lib/utils'
import { apiError } from '@/lib/api-handler'

const userSel = { id: true, name: true, role: true, department: true }
const FINANCE_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
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
 } catch (err) {
  return apiError(err)
 }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
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
    } else if (key === 'subtotal') {
      const n = parseNonNegativeNumber(body[key])
      if (n == null) return NextResponse.json({ error: 'ยอดก่อนภาษีต้องไม่ติดลบ' }, { status: 400 })
      data[key] = n
    } else if (['vatRate', 'whtRate'].includes(key)) {
      const n = parseNonNegativeNumber(body[key])
      if (n == null || n > 1) {
        return NextResponse.json({ error: 'อัตราภาษีต้องอยู่ระหว่าง 0-1 (เช่น 0.07 = 7%)' }, { status: 400 })
      }
      data[key] = n
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
    // Floor at 0 — same guard the sibling payments-POST route already applies,
    // this PATCH path was missing it, letting a bad edit push AR-aging negative.
    data.remainingAmount = Math.max(0, (data.totalAmount as number) - existing.paidAmount)
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
 } catch (err) {
  return apiError(err)
 }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await prisma.billingInvoice.delete({ where: { id } })
  return NextResponse.json({ ok: true })
 } catch (err) {
  return apiError(err)
 }
}
