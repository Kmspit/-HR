import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { v2 as cloudinary } from 'cloudinary'

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
}

const FINANCE_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!FINANCE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const payments = await prisma.billingPayment.findMany({
    where: { invoiceId: id },
    include: {
      receivedBy: { select: { id: true, name: true } },
      createdBy:  { select: { id: true, name: true } },
    },
    orderBy: { paidAt: 'asc' },
  })
  return NextResponse.json(payments)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!FINANCE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const invoice = await prisma.billingInvoice.findUnique({ where: { id } })
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  let slipUrl: string | null = null
  let slipPublicId: string | null = null
  let body: Record<string, string>

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const fd            = await req.formData()
    const slipFile      = fd.get('slip') as File | null
    body = {
      amount:         fd.get('amount')         as string,
      paidAt:         fd.get('paidAt')         as string,
      paymentMethod:  fd.get('paymentMethod')  as string,
      bankAccount:    fd.get('bankAccount')    as string ?? '',
      note:           fd.get('note')           as string ?? '',
      idempotencyKey: fd.get('idempotencyKey') as string ?? '',
    }
    if (slipFile && slipFile.size > 0) {
      configureCloudinary()
      const buf = Buffer.from(await slipFile.arrayBuffer())
      const uploaded = await new Promise<{ secure_url: string; public_id: string }>((res, rej) => {
        cloudinary.uploader.upload_stream(
          { folder: 'billing-slips', resource_type: 'auto' },
          (err, result) => err ? rej(err) : res(result as { secure_url: string; public_id: string })
        ).end(buf)
      })
      slipUrl      = uploaded.secure_url
      slipPublicId = uploaded.public_id
    }
  } else {
    body = await req.json()
  }

  const amount = Number(body.amount ?? 0)
  if (amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

  const idempotencyKey = body.idempotencyKey || null
  if (idempotencyKey) {
    const existingPayment = await prisma.billingPayment.findUnique({ where: { idempotencyKey } })
    if (existingPayment) return NextResponse.json(existingPayment, { status: 200 })
  }

  let payment
  try {
    payment = await prisma.billingPayment.create({
      data: {
        invoiceId:      id,
        amount,
        paidAt:         body.paidAt ? new Date(body.paidAt) : new Date(),
        paymentMethod:  body.paymentMethod ?? 'Bank Transfer',
        bankAccount:    body.bankAccount  || null,
        slipUrl,
        slipPublicId,
        receivedById:   session.user.id,
        note:           body.note         || null,
        idempotencyKey,
        createdById:    session.user.id,
      },
    })
  } catch (err) {
    // A concurrent request with the same idempotencyKey won the race — this is
    // a resubmission of the same user action, not a new payment; return the
    // row that already exists instead of erroring or double-recording it.
    if ((err as { code?: string })?.code === 'P2002' && idempotencyKey) {
      const existingPayment = await prisma.billingPayment.findUnique({ where: { idempotencyKey } })
      if (existingPayment) return NextResponse.json(existingPayment, { status: 200 })
    }
    throw err
  }

  // Atomic increment — never read-then-add invoice.paidAmount in application
  // code, since two concurrent payments would both compute from the same stale
  // value and one payment's amount would be silently lost from the total.
  const updatedInvoice = await prisma.billingInvoice.update({
    where: { id },
    data:  { paidAmount: { increment: amount } },
  })
  const newRemaining = Math.max(0, updatedInvoice.totalAmount - updatedInvoice.paidAmount)
  const newStatus    = newRemaining <= 0
    ? 'PAID'
    : updatedInvoice.paidAmount > 0
    ? 'PENDING_PAYMENT'
    : updatedInvoice.status

  await prisma.billingInvoice.update({
    where: { id },
    data:  { remainingAmount: newRemaining, status: newStatus },
  })

  return NextResponse.json(payment, { status: 201 })
}
