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
  const records = await prisma.clientSlaRecord.findMany({
    where: { clientCompanyId: id },
    include: { createdBy: { select: userSel } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const met    = records.filter((r) => r.met === true).length
  const missed = records.filter((r) => r.met === false).length
  const total  = records.filter((r) => r.met !== null).length
  const rate   = total > 0 ? (met / total) * 100 : null

  return NextResponse.json({ records, stats: { met, missed, total, rate } })
} catch (err) {
  return apiError(err)
 }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id }  = await params
  const body    = await req.json()
  const { contractId, taskId, slaType, targetHours, actualHours, met, note, resolvedAt } = body

  if (!slaType || targetHours == null) {
    return NextResponse.json({ error: 'slaType and targetHours required' }, { status: 400 })
  }

  const record = await prisma.clientSlaRecord.create({
    data: {
      clientCompanyId: id,
      contractId:  contractId  || null,
      taskId:      taskId      || null,
      slaType,
      targetHours: Number(targetHours),
      actualHours: actualHours != null ? Number(actualHours) : null,
      met:         met != null ? Boolean(met) : null,
      note:        note        || null,
      resolvedAt:  resolvedAt  ? new Date(resolvedAt) : null,
      createdById: session.user.id,
    },
    include: { createdBy: { select: userSel } },
  })

  return NextResponse.json(record, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
