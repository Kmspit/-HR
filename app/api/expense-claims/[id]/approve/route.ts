import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { requireCsrf } from '@/lib/api-guard'
import { canViewUserRecord, isCompanyWideApprover } from '@/lib/org-scope'
import type { Role } from '@prisma/client'

async function canActOnExpenseClaim(
  actorId: string,
  role: Role,
  branchId: string | null | undefined,
  submitterId: string,
): Promise<boolean> {
  if (isCompanyWideApprover(role)) {
    return canViewUserRecord(prisma, actorId, role, branchId, submitterId)
  }
  if (role === 'MANAGER' || role === 'TEAM_LEADER') {
    return canViewUserRecord(prisma, actorId, role, branchId, submitterId)
  }
  return false
}

// action: supervisor_approve | ceo_approve | reject | mark_paid
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfErr = requireCsrf(req)
  if (csrfErr) return csrfErr

  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { action, note } = await req.json()
  const role = session.user.role as Role
  const userId = session.user.id

  const claim = await prisma.expenseClaim.findUnique({
    where: { id },
    include: { submittedBy: { select: { id: true, name: true } } },
  })
  if (!claim) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const inScope = await canActOnExpenseClaim(
    userId,
    role,
    session.user.branchId,
    claim.submittedBy.id,
  )

  let data: Record<string, unknown> = {}
  let notifType: string
  let notifTitle: string
  let notifMsg: string

  if (action === 'supervisor_approve') {
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (claim.status !== 'PENDING') {
      return NextResponse.json({ error: 'Claim is not PENDING' }, { status: 400 })
    }
    data = { status: 'SUPERVISOR_APPROVED', supervisorNote: note || null }
    notifType = 'EXPENSE_CLAIM_APPROVED'
    notifTitle = 'ใบเบิกได้รับการอนุมัติขั้น 1'
    notifMsg = `${claim.title} — รออนุมัติจาก CEO`
  } else if (action === 'ceo_approve') {
    if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!['PENDING', 'SUPERVISOR_APPROVED'].includes(claim.status)) {
      return NextResponse.json({ error: 'Invalid status for CEO approval' }, { status: 400 })
    }
    data = { status: 'CEO_APPROVED', ceoNote: note || null }
    notifType = 'EXPENSE_CLAIM_APPROVED'
    notifTitle = 'ใบเบิกได้รับการอนุมัติจาก CEO'
    notifMsg = `${claim.title} — รอการจ่ายเงิน`
  } else if (action === 'reject') {
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (['PAID'].includes(claim.status)) {
      return NextResponse.json({ error: 'Cannot reject paid claim' }, { status: 400 })
    }
    data = { status: 'REJECTED', rejectedNote: note || null }
    notifType = 'EXPENSE_CLAIM_REJECTED'
    notifTitle = 'ใบเบิกถูกปฏิเสธ'
    notifMsg = `${claim.title}${note ? ` — เหตุผล: ${note}` : ''}`
  } else if (action === 'mark_paid') {
    if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (claim.status !== 'CEO_APPROVED') {
      return NextResponse.json({ error: 'Claim must be CEO_APPROVED before marking paid' }, { status: 400 })
    }
    data = { status: 'PAID', paidAt: new Date() }
    notifType = 'EXPENSE_CLAIM_PAID'
    notifTitle = 'ได้รับเงินเบิกแล้ว'
    notifMsg = `${claim.title} — ${claim.amount.toLocaleString('th-TH')} บาท`
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const updated = await prisma.expenseClaim.update({
    where: { id },
    data,
    include: { submittedBy: { select: { id: true, name: true } }, files: true },
  })

  void createNotification({
    userId: claim.submittedBy.id,
    type: notifType as never,
    title: notifTitle,
    message: notifMsg,
  })

  return NextResponse.json(updated)
}
