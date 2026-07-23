import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

const userSel = { id: true, name: true, department: true, role: true }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id }  = await params
  const body    = await req.json()

  const existing = await prisma.clientContract.findUnique({ where: { id }, select: { status: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allowed = ['serviceType', 'startDate', 'endDate', 'value', 'slaAgreement', 'paymentTerms', 'status', 'note']
  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) {
      if (['startDate', 'endDate'].includes(key)) {
        data[key] = body[key] ? new Date(body[key]) : null
      } else if (key === 'value') {
        data[key] = Number(body[key] ?? 0)
      } else {
        data[key] = body[key] === '' ? null : body[key]
      }
    }
  }

  // Compare-and-swap on status: a plain update({where:{id}}) has a read-then-write
  // gap where two concurrent PATCH requests (e.g. terminate + renew) can both read
  // the same prior status and both write, the second silently overwriting the
  // first with no error. Guard the write itself on the status still holding at
  // write time — same pattern as warnings/expense-claims/outside-work/attendance.
  const result = await prisma.clientContract.updateMany({
    where: { id, status: existing.status },
    data,
  })
  if (result.count === 0) {
    return NextResponse.json({ error: 'สถานะสัญญาถูกเปลี่ยนไปแล้วโดยคำขออื่น กรุณาโหลดข้อมูลใหม่' }, { status: 409 })
  }

  const contract = await prisma.clientContract.findUniqueOrThrow({
    where: { id },
    include: {
      clientCompany: { select: { id: true, clientCode: true, companyName: true } },
      createdBy:     { select: userSel },
      files:         true,
    },
  })

  return NextResponse.json(contract)
} catch (err) {
  return apiError(err)
 }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await prisma.clientContract.delete({ where: { id } })
  return NextResponse.json({ ok: true })
} catch (err) {
  return apiError(err)
 }
}
