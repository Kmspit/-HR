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
  const { serviceType, startDate, endDate, value, slaAgreement, paymentTerms, note, renewedFromId } = body

  if (!serviceType || !startDate || !endDate) {
    return NextResponse.json({ error: 'serviceType, startDate, endDate required' }, { status: 400 })
  }

  // Renewal: the old contract must belong to this same company and still be
  // ACTIVE — without this check a typo'd id could silently supersede an
  // unrelated company's contract, or double-supersede one already renewed.
  let renewalSource: { id: string } | null = null
  if (renewedFromId) {
    renewalSource = await prisma.clientContract.findFirst({
      where: { id: renewedFromId, clientCompanyId: id, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!renewalSource) {
      return NextResponse.json({ error: 'ไม่พบสัญญาเดิมที่จะต่ออายุ หรือสัญญานั้นไม่ได้อยู่ในสถานะ ACTIVE แล้ว' }, { status: 400 })
    }
  }

  const count   = await prisma.clientContract.count()
  const year    = new Date().getFullYear()
  const contractNumber = `CTR-${year}-${String(count + 1).padStart(4, '0')}`

  // Creating the renewal and superseding the old contract must commit
  // together — if either half failed alone we'd either lose the "renewed
  // from" link or leave the old contract still ACTIVE, double-counting it
  // in every ACTIVE-scoped revenue/dashboard total again.
  const contract = await prisma.$transaction(async (tx) => {
    const created = await tx.clientContract.create({
      data: {
        clientCompanyId: id,
        contractNumber,
        serviceType,
        startDate:     new Date(startDate),
        endDate:       new Date(endDate),
        value:         Number(value ?? 0),
        slaAgreement:  slaAgreement || null,
        paymentTerms:  paymentTerms || null,
        note:          note         || null,
        renewedFromId: renewalSource?.id ?? null,
        createdById:   session.user.id,
      },
      include: {
        createdBy: { select: userSel },
        files:     true,
      },
    })

    if (renewalSource) {
      const superseded = await tx.clientContract.updateMany({
        where: { id: renewalSource.id, status: 'ACTIVE' },
        data:  { status: 'SUPERSEDED' },
      })
      if (superseded.count === 0) {
        // Someone else changed the old contract's status between our check
        // above and this write (e.g. manually terminated it) — abort rather
        // than create a renewal pointing at a contract we didn't actually
        // supersede.
        throw new Error('RENEWAL_SOURCE_CHANGED')
      }
    }

    return created
  }).catch((err) => {
    if (err instanceof Error && err.message === 'RENEWAL_SOURCE_CHANGED') return null
    throw err
  })

  if (!contract) {
    return NextResponse.json({ error: 'สัญญาเดิมถูกเปลี่ยนสถานะไปแล้วระหว่างที่บันทึก กรุณาลองใหม่' }, { status: 409 })
  }

  return NextResponse.json(contract, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
