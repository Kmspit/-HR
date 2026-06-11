import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q     = searchParams.get('q') ?? ''
  const page  = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = 50

  const where: Record<string, unknown> = {}
  if (q) {
    where.OR = [
      { receiptNumber: { contains: q } },
      { receiverName:  { contains: q } },
      { invoice:       { invoiceNumber: { contains: q } } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.billingReceipt.findMany({
      where,
      include: {
        invoice:   { select: { invoiceNumber: true, clientName: true, clientCompany: { select: { companyName: true } } } },
        payment:   { select: { paymentMethod: true, bankAccount: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { issuedAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.billingReceipt.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) })
}
