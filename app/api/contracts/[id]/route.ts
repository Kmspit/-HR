import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const userSel = { id: true, name: true, department: true, role: true }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id }  = await params
  const body    = await req.json()

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

  const contract = await prisma.clientContract.update({
    where: { id },
    data,
    include: {
      clientCompany: { select: { id: true, clientCode: true, companyName: true } },
      createdBy:     { select: userSel },
      files:         true,
    },
  })

  return NextResponse.json(contract)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await prisma.clientContract.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
