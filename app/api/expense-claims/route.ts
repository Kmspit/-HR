import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { sendLineApprovalRequest } from '@/lib/line-notifications'
import { parsePositiveAmount } from '@/lib/utils'
import { apiError } from '@/lib/api-handler'

const CAN_APPROVE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER']
const userSel = { id: true, name: true, department: true, role: true }

export async function GET(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit  = 30

  const role   = session.user.role
  const userId = session.user.id

  const where: Record<string, unknown> = {}

  // Role-scoped
  if (!CAN_APPROVE.includes(role)) {
    // Employee: see only own claims
    where.submittedById = userId
  } else if (['TEAM_LEADER', 'MANAGER'].includes(role)) {
    // Supervisor: see claims they need to approve (PENDING) or already acted on
    where.OR = [
      { submittedById: userId },
      { status: { in: ['PENDING', 'SUPERVISOR_APPROVED', 'CEO_APPROVED', 'REJECTED', 'PAID'] } },
    ]
  }
  // HR/CEO/SUPER_ADMIN: see all

  if (q) {
    const qFilter = { OR: [{ title: { contains: q } }, { caseNumber: { contains: q } }] }
    where.AND = [qFilter]
  }
  if (status) where.status = status

  const [items, total] = await Promise.all([
    prisma.expenseClaim.findMany({
      where,
      include: {
        submittedBy: { select: userSel },
        files:       true,
      },
      orderBy: { createdAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.expenseClaim.count({ where }),
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
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { title, taskId, caseNumber, expenseType, amount, date, note } = body

  if (!title || !expenseType || !amount || !date) {
    return NextResponse.json({ error: 'title, expenseType, amount, date required' }, { status: 400 })
  }
  const validAmount = parsePositiveAmount(amount)
  if (validAmount == null) {
    return NextResponse.json({ error: 'จำนวนเงินต้องมากกว่า 0' }, { status: 400 })
  }

  const claim = await prisma.expenseClaim.create({
    data: {
      title,
      taskId:        taskId || null,
      caseNumber:    caseNumber || null,
      expenseType,
      amount:        validAmount,
      date:          new Date(date),
      note:          note || null,
      status:        'PENDING',
      submittedById: session.user.id,
    },
    include: { submittedBy: { select: userSel }, files: true },
  })

  // Notify managers/HR
  const approvers = await prisma.user.findMany({
    where: { role: { in: ['MANAGER_HR', 'HR', 'CEO', 'SUPER_ADMIN'] as never[] }, status: 'ACTIVE' },
    select: { id: true },
  })
  for (const a of approvers.slice(0, 5)) {
    void createNotification({
      userId:  a.id,
      type:    'EXPENSE_CLAIM_SUBMITTED',
      title:   'มีการยื่นเบิกค่าใช้จ่ายใหม่',
      message: `${claim.submittedBy.name} ยื่นเบิก ${title} — ${validAmount.toLocaleString('th-TH')} บาท`,
    })
  }
  // Phase 14 — LINE approval card
  void sendLineApprovalRequest({
    approvalType: 'EXPENSE',
    id: claim.id,
    title: `${title} — ฿${validAmount.toLocaleString('th-TH')}`,
    requesterName: claim.submittedBy.name,
    details: [
      { label: 'ประเภท', value: String(expenseType) },
      { label: 'จำนวน', value: `฿${validAmount.toLocaleString('th-TH')} บาท` },
      ...(caseNumber ? [{ label: 'เลขคดี', value: String(caseNumber) }] : []),
      ...(note ? [{ label: 'หมายเหตุ', value: String(note).slice(0, 60) }] : []),
    ],
  })

  return NextResponse.json(claim, { status: 201 })
 } catch (err) {
  return apiError(err)
 }
}
