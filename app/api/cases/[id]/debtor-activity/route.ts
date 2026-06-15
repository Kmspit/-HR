import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const EXEC_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

async function canAccess(caseId: string, userId: string, role: string, department?: string | null) {
  if (EXEC_ROLES.includes(role)) return true
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { createdById: true, assignedEmployeeId: true, department: true } })
  if (!c) return false
  if (role === 'MANAGER' && department && c.department === department) return true
  return c.createdById === userId || c.assignedEmployeeId === userId
}

const VALID_TYPES = [
  'phone_contacted', 'unable_to_contact', 'payment_promise',
  'payment_completed', 'refused_payment', 'settlement_discussion',
  'lawsuit_filed', 'letter_sent', 'visit_in_person', 'other',
]

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  if (!await canAccess(id, session.user.id, session.user.role, session.user.department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const activities = await prisma.caseDebtorActivity.findMany({
    where: { caseId: id },
    include: { actor: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ activities })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  if (!await canAccess(id, session.user.id, session.user.role, session.user.department)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { activityType, note, promisedDate, promisedAmount } = body

  if (!activityType || !VALID_TYPES.includes(activityType)) {
    return NextResponse.json({ error: 'ประเภทกิจกรรมไม่ถูกต้อง' }, { status: 400 })
  }

  const activity = await prisma.caseDebtorActivity.create({
    data: {
      caseId:        id,
      actorId:       session.user.id,
      activityType,
      note:          note?.trim() ?? null,
      promisedDate:  promisedDate  ? new Date(promisedDate)  : null,
      promisedAmount: promisedAmount ? Number(promisedAmount) : null,
    },
    include: { actor: { select: { id: true, name: true, role: true } } },
  })

  const ACTIVITY_LABELS: Record<string, string> = {
    phone_contacted:       'โทรติดต่อสำเร็จ',
    unable_to_contact:     'โทรติดต่อไม่ได้',
    payment_promise:       'นัดชำระหนี้',
    payment_completed:     'ชำระหนี้แล้ว',
    refused_payment:       'ปฏิเสธการชำระ',
    settlement_discussion: 'เจรจาประนอม',
    lawsuit_filed:         'ยื่นฟ้องแล้ว',
    letter_sent:           'ส่งหนังสือแล้ว',
    visit_in_person:       'เข้าพบลูกหนี้',
    other:                 'อื่นๆ',
  }

  await prisma.caseTimeline.create({
    data: {
      caseId:      id,
      userId:      session.user.id,
      action:      'debtor_activity',
      description: `${session.user.name}: ${ACTIVITY_LABELS[activityType] ?? activityType}${note ? ` — ${note}` : ''}`,
      meta:        JSON.stringify({ activityType, promisedDate, promisedAmount }),
    },
  })

  return NextResponse.json({ activity }, { status: 201 })
}
