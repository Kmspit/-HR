import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { canViewUserRecord, isCompanyWideApprover } from '@/lib/org-scope'
import { apiError } from '@/lib/api-handler'
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
 try {
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

  // The requester must never be the one who approves or pays out their own
  // claim — canActOnExpenseClaim (via canViewUserRecord) intentionally returns
  // true for "viewing your own record", which is correct for viewing but must
  // not also authorize approving/paying it.
  const isSelfClaim = claim.submittedBy.id === userId

  let statusPrecondition: string[]
  let data: Record<string, unknown> = {}
  let notifType: string
  let notifTitle: string
  let notifMsg: string

  if (action === 'supervisor_approve') {
    if (!inScope || isSelfClaim) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    statusPrecondition = ['PENDING']
    data = { status: 'SUPERVISOR_APPROVED', supervisorNote: note || null }
    notifType = 'EXPENSE_CLAIM_APPROVED'
    notifTitle = 'ใบเบิกได้รับการอนุมัติขั้น 1'
    notifMsg = `${claim.title} — รออนุมัติจาก CEO`
  } else if (action === 'ceo_approve') {
    if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR'].includes(role) || isSelfClaim) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    statusPrecondition = ['PENDING', 'SUPERVISOR_APPROVED']
    data = { status: 'CEO_APPROVED', ceoNote: note || null }
    notifType = 'EXPENSE_CLAIM_APPROVED'
    notifTitle = 'ใบเบิกได้รับการอนุมัติจาก CEO'
    notifMsg = `${claim.title} — รอการจ่ายเงิน`
  } else if (action === 'reject') {
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    statusPrecondition = ['PENDING', 'SUPERVISOR_APPROVED', 'CEO_APPROVED']
    data = { status: 'REJECTED', rejectedNote: note || null }
    notifType = 'EXPENSE_CLAIM_REJECTED'
    notifTitle = 'ใบเบิกถูกปฏิเสธ'
    notifMsg = `${claim.title}${note ? ` — เหตุผล: ${note}` : ''}`
  } else if (action === 'mark_paid') {
    if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'].includes(role) || isSelfClaim) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    statusPrecondition = ['CEO_APPROVED']
    data = { status: 'PAID', paidAt: new Date() }
    notifType = 'EXPENSE_CLAIM_PAID'
    notifTitle = 'ได้รับเงินเบิกแล้ว'
    notifMsg = `${claim.title} — ${claim.amount.toLocaleString('th-TH')} บาท`
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Atomic status-guarded update — re-checks the precondition against the DB's
  // current row at write time (not the stale `claim` read above), so a
  // double-click or two concurrent requests can only ever have one of them
  // actually flip the status.
  const result = await prisma.expenseClaim.updateMany({
    where: { id, status: { in: statusPrecondition } },
    data,
  })
  if (result.count === 0) {
    return NextResponse.json({ error: 'สถานะใบเบิกถูกเปลี่ยนไปแล้ว กรุณารีเฟรชหน้าจอ' }, { status: 409 })
  }

  const updated = await prisma.expenseClaim.findUnique({
    where: { id },
    include: { submittedBy: { select: { id: true, name: true } }, files: true },
  })

  void createNotification({
    userId: claim.submittedBy.id,
    type: notifType as never,
    title: notifTitle,
    message: notifMsg,
  })

  return NextResponse.json(updated)
 } catch (err) {
  return apiError(err)
 }
}
