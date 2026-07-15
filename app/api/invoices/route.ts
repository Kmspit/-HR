import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { parseNonNegativeNumber } from '@/lib/utils'
import { apiError } from '@/lib/api-handler'

const userSel = { id: true, name: true, role: true, department: true }

const FINANCE_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q            = searchParams.get('q') ?? ''
  const status       = searchParams.get('status') ?? ''
  const clientId     = searchParams.get('clientId') ?? ''
  const overdue      = searchParams.get('overdue') === 'true'
  const clientPortal = searchParams.get('clientPortal') === 'true'
  const page         = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit        = 50
  const now          = new Date()

  const where: Record<string, unknown> = {}

  // CLIENT role: see only invoices for their linked ClientCompany
  if (session.user.role === 'CLIENT' || clientPortal) {
    if (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'CEO') {
      // Find client company linked to this user via clientTasks → clientCompanyId
      const userRecord = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true },
      })
      // Map by clientName match as fallback since portal users may not have explicit link
      where.OR = [
        { clientName: { contains: userRecord?.name ?? '' } },
      ]
    }
  }

  if (q) {
    where.OR = [
      { invoiceNumber: { contains: q } },
      { clientName:    { contains: q } },
      { serviceType:   { contains: q } },
    ]
  }
  if (status)   where.status           = status
  if (clientId) where.clientCompanyId  = clientId
  if (overdue)  where.AND = [
    { status: { notIn: ['PAID', 'CANCELLED'] } },
    { dueDate: { lt: now } },
  ]

  const [items, total] = await Promise.all([
    prisma.billingInvoice.findMany({
      where,
      include: {
        clientCompany: { select: { id: true, clientCode: true, companyName: true } },
        createdBy:     { select: userSel },
        approvedBy:    { select: userSel },
        _count:        { select: { payments: true, receipts: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.billingInvoice.count({ where }),
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
  if (!FINANCE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    clientCompanyId, clientName, clientTaxId, clientAddress,
    taskId, serviceType, lineItems,
    subtotal, vatRate = 0.07, whtRate = 0,
    issueDate, dueDate, note,
  } = body

  if (!clientName || !serviceType || !issueDate || !dueDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const sub = parseNonNegativeNumber(subtotal ?? 0)
  if (sub == null) {
    return NextResponse.json({ error: 'ยอดก่อนภาษีต้องไม่ติดลบ' }, { status: 400 })
  }
  const vatR = parseNonNegativeNumber(vatRate)
  const whtR = parseNonNegativeNumber(whtRate)
  if (vatR == null || vatR > 1 || whtR == null || whtR > 1) {
    return NextResponse.json({ error: 'อัตราภาษีต้องอยู่ระหว่าง 0-1 (เช่น 0.07 = 7%)' }, { status: 400 })
  }

  // Auto-generate invoice number: INV-YYYY-NNNN
  const year  = new Date().getFullYear()
  const count = await prisma.billingInvoice.count({
    where: { invoiceNumber: { startsWith: `INV-${year}-` } },
  })
  const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`

  const vatAmt   = Math.round(sub * vatR * 100) / 100
  const whtAmt   = Math.round(sub * whtR * 100) / 100
  const total    = sub + vatAmt - whtAmt

  const invoice = await prisma.billingInvoice.create({
    data: {
      invoiceNumber,
      clientCompanyId: clientCompanyId || null,
      clientName,
      clientTaxId:    clientTaxId    || null,
      clientAddress:  clientAddress  || null,
      taskId:         taskId         || null,
      serviceType,
      lineItems:      JSON.stringify(lineItems ?? []),
      subtotal:       sub,
      vatRate:        vatR,
      vatAmount:      vatAmt,
      whtRate:        whtR,
      whtAmount:      whtAmt,
      totalAmount:    total,
      remainingAmount: total,
      issueDate:      new Date(issueDate),
      dueDate:        new Date(dueDate),
      note:           note || null,
      createdById:    session.user.id,
    },
    include: {
      clientCompany: { select: { id: true, clientCode: true, companyName: true } },
      createdBy:     { select: userSel },
    },
  })

  // Notify CEO + finance users
  const recipients = await prisma.user.findMany({
    where: { role: { in: ['CEO', 'SUPER_ADMIN'] as never[] }, status: 'ACTIVE' },
    select: { id: true },
  })
  for (const r of recipients) {
    if (r.id !== session.user.id) {
      void createNotification({
        userId:  r.id,
        type:    'INVOICE_CREATED',
        title:   'สร้างใบแจ้งหนี้ใหม่',
        message: `${invoiceNumber} — ${clientName} (฿${total.toLocaleString('th-TH')})`,
        link:    `/invoices`,
      })
    }
  }

  return NextResponse.json(invoice, { status: 201 })
 } catch (err) {
  return apiError(err)
 }
}
