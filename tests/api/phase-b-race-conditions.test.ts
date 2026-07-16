import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  sendLineMessage:     vi.fn().mockResolvedValue(undefined),
  sendLineNotify:      vi.fn().mockResolvedValue(true),
  createAuditLog:      vi.fn().mockResolvedValue({ id: 'audit-1' }),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map([['x-forwarded-for', '1.2.3.4']])),
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => void) => fn() }
})

vi.mock('cloudinary', () => ({ v2: { config: vi.fn(), uploader: { upload_stream: vi.fn() } } }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    debtor:              { findUnique: vi.fn(), update: vi.fn() },
    debtPayment:          { create: vi.fn() },
    warning:              { findUnique: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    approvalRequest:      { findUnique: vi.fn(), updateMany: vi.fn() },
    approvalRequestStep:  { update: vi.fn() },
    activityLog:          { create: vi.fn(), findMany: vi.fn() },
    digitalSignature:     { findMany: vi.fn(), create: vi.fn() },
    notification:         { createMany: vi.fn() },
    user:                 { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), findUnique: vi.fn() },
    outsideWorkRequest:   { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    taskAssignment:       { findUnique: vi.fn(), update: vi.fn() },
    taskDependency:       { findFirst: vi.fn() },
    taskTimeline:         { createMany: vi.fn() },
    paymentAppointment:   { findUnique: vi.fn(), update: vi.fn() },
    billingInvoice:       { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    billingPayment:       { create: vi.fn(), findUnique: vi.fn() },
    clientCompany:        { update: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  },
}))

vi.mock('@/lib/debtor-access', () => ({
  checkDebtorAccess: vi.fn().mockResolvedValue({ status: 'ok' }),
}))

vi.mock('@/lib/access-control', () => ({
  canApproveWarning: vi.fn().mockReturnValue(true),
  canManageUsers:    vi.fn().mockReturnValue(false),
  hasPermission:     vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/org-scope', () => ({
  canViewUserRecord:     vi.fn().mockResolvedValue(true),
  isCompanyWideApprover: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/approval-request-access', () => ({
  canActOnApprovalStep:   vi.fn().mockResolvedValue(true),
  canViewApprovalRequest: vi.fn().mockResolvedValue(true),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification, createAuditLog } from '@/lib/notifications'
import { canActOnApprovalStep } from '@/lib/approval-request-access'
import { hasPermission } from '@/lib/access-control'

import { POST as debtorPaymentsPost } from '@/app/api/debtors/[id]/payments/route'
import { PATCH as warningPatch } from '@/app/api/warnings/[id]/route'
import { PATCH as approvalRequestPatch } from '@/app/api/approval-requests/[id]/route'
import { DELETE as outsideWorkDelete } from '@/app/api/outside-work/[id]/route'
import { PATCH as taskPatch } from '@/app/api/tasks/[id]/route'
import { PATCH as paymentAppointmentPatch } from '@/app/api/payment-appointments/[id]/route'
import { POST as invoicePaymentsPost } from '@/app/api/invoices/[id]/payments/route'
import { PATCH as clientCompanyPatch } from '@/app/api/client-companies/[id]/route'
import { POST as digitalSignaturePost } from '@/app/api/digital-signatures/route'

function jsonReq(url: string, body: Record<string, unknown>, method = 'POST') {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── 1. Debtor balance race ───────────────────────────────────────────────────

describe('POST /api/debtors/[id]/payments — atomic balance increment (Phase B)', () => {
  const params = Promise.resolve({ id: 'debtor-1' })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'MANAGER' } } as never)
    vi.mocked(prisma.debtor.findUnique).mockResolvedValue({
      id: 'debtor-1', paidAmount: 200, totalDebt: 1000, remainingDebt: 800, assignedToId: null,
      firstName: 'A', lastName: 'B',
    } as never)
    vi.mocked(prisma.debtor.update).mockResolvedValue({
      id: 'debtor-1', paidAmount: 700, remainingDebt: 300,
    } as never)
    vi.mocked(prisma.debtPayment.create).mockResolvedValue({ id: 'pay-1', amount: 500 } as never)
  })

  it('increments paidAmount/remainingDebt atomically instead of writing a JS-computed absolute value', async () => {
    await debtorPaymentsPost(
      jsonReq('http://localhost/api/debtors/debtor-1/payments', { amount: 500, paidAt: '2026-07-15', channel: 'CASH' }),
      { params },
    )
    expect(prisma.debtor.update).toHaveBeenCalledWith({
      where: { id: 'debtor-1' },
      data: { paidAmount: { increment: 500 }, remainingDebt: { decrement: 500 } },
    })
  })

  it('derives status/remainingDebt from the atomic update result inside the payment transaction', async () => {
    vi.mocked(prisma.debtor.update).mockResolvedValue({
      id: 'debtor-1', paidAmount: 1000, remainingDebt: 0,
    } as never)
    const res = await debtorPaymentsPost(
      jsonReq('http://localhost/api/debtors/debtor-1/payments', { amount: 800, paidAt: '2026-07-15', channel: 'CASH' }),
      { params },
    )
    expect(res.status).toBe(201)
    expect(prisma.$transaction).toHaveBeenCalled()
  })
})

// ── 2. Warning approve/reject race ───────────────────────────────────────────

describe('PATCH /api/warnings/[id] — atomic status compare-and-swap (Phase B)', () => {
  const params = Promise.resolve({ id: 'warn-1' })
  const pendingWarning = { id: 'warn-1', userId: 'emp-1', level: 1, reason: 'สาย', status: 'PENDING_APPROVAL' }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'hr-1', role: 'HR', branchId: 'b1' } } as never)
    vi.mocked(prisma.warning.findUnique).mockResolvedValue(pendingWarning as never)
    vi.mocked(prisma.warning.findUniqueOrThrow).mockResolvedValue({ ...pendingWarning, status: 'APPROVED' } as never)
  })

  it('writes via updateMany guarded on the exact precondition status', async () => {
    vi.mocked(prisma.warning.updateMany).mockResolvedValue({ count: 1 } as never)
    const res = await warningPatch(jsonReq('http://localhost/api/warnings/warn-1', { action: 'APPROVE' }, 'PATCH'), { params })
    expect(res.status).toBe(200)
    expect(prisma.warning.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'warn-1', status: 'PENDING_APPROVAL' } }),
    )
  })

  it('rejects the loser of a concurrent approve/reject race with 409', async () => {
    vi.mocked(prisma.warning.updateMany).mockResolvedValue({ count: 0 } as never)
    const res = await warningPatch(jsonReq('http://localhost/api/warnings/warn-1', { action: 'REJECT' }, 'PATCH'), { params })
    expect(res.status).toBe(409)
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('ARCHIVE guards on status being in [APPROVED, REJECTED]', async () => {
    vi.mocked(prisma.warning.findUnique).mockResolvedValue({ ...pendingWarning, status: 'APPROVED' } as never)
    vi.mocked(prisma.warning.updateMany).mockResolvedValue({ count: 1 } as never)
    await warningPatch(jsonReq('http://localhost/api/warnings/warn-1', { action: 'ARCHIVE' }, 'PATCH'), { params })
    expect(prisma.warning.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'warn-1', status: { in: ['APPROVED', 'REJECTED'] } } }),
    )
  })
})

// ── 3. Approval-requests multi-step chain race ───────────────────────────────

describe('PATCH /api/approval-requests/[id] — atomic status+currentStep compare-and-swap (Phase B)', () => {
  const params = Promise.resolve({ id: 'req-1' })
  const step1 = { id: 'step-1', stepOrder: 1, approverId: 'apv-1', approverRole: null }
  const step2 = { id: 'step-2', stepOrder: 2, approverId: 'apv-2', approverRole: null }
  const baseRequest = {
    id: 'req-1', title: 'Test request', status: 'IN_REVIEW', currentStep: 1, totalSteps: 2,
    docType: 'ApprovalRequest', docId: 'doc-1', docRef: null,
    steps: [step1, step2], requestedBy: { id: 'requester-1', name: 'Requester' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'apv-1', name: 'Approver', role: 'MANAGER' } } as never)
    vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValue(baseRequest as never)
    vi.mocked(canActOnApprovalStep).mockResolvedValue(true as never)
  })

  it('gates all side effects on an atomic status+currentStep compare-and-swap', async () => {
    vi.mocked(prisma.approvalRequest.updateMany).mockResolvedValue({ count: 1 } as never)
    const res = await approvalRequestPatch(jsonReq('http://localhost/api/approval-requests/req-1', { action: 'APPROVE', stepId: 'step-1' }, 'PATCH'), { params })
    expect(res.status).toBe(200)
    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'req-1', status: 'IN_REVIEW', currentStep: 1 } }),
    )
    expect(prisma.approvalRequestStep.update).toHaveBeenCalled()
  })

  it('rejects the loser of a concurrent action with 409, and never touches steps/notifications', async () => {
    vi.mocked(prisma.approvalRequest.updateMany).mockResolvedValue({ count: 0 } as never)
    const res = await approvalRequestPatch(jsonReq('http://localhost/api/approval-requests/req-1', { action: 'REJECT', stepId: 'step-1' }, 'PATCH'), { params })
    expect(res.status).toBe(409)
    expect(prisma.approvalRequestStep.update).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })
})

// ── 4. Outside-work soft-delete vs approval race ─────────────────────────────

describe('DELETE /api/outside-work/[id] — atomic pending-guard on soft-delete (Phase B)', () => {
  const params = Promise.resolve({ id: 'ow-1' })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'emp-1', role: 'EMPLOYEE' } } as never)
    vi.mocked(hasPermission).mockReturnValue(false as never)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue({
      userId: 'emp-1', status: 'PENDING', approvalStatus: 'pending_chain', deletedAt: null,
    } as never)
  })

  it('writes via updateMany re-asserting the pending condition, not a plain update', async () => {
    vi.mocked(prisma.outsideWorkRequest.updateMany).mockResolvedValue({ count: 1 } as never)
    const res = await outsideWorkDelete(new NextRequest('http://localhost/api/outside-work/ow-1', { method: 'DELETE' }), { params })
    expect(res.status).toBe(200)
    expect(prisma.outsideWorkRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'ow-1', deletedAt: null,
          OR: [{ status: 'PENDING' }, { approvalStatus: 'pending_ceo' }, { approvalStatus: 'pending_chain' }],
        }),
      }),
    )
  })

  it('rejects a delete that races a just-completed approval with 409', async () => {
    vi.mocked(prisma.outsideWorkRequest.updateMany).mockResolvedValue({ count: 0 } as never)
    const res = await outsideWorkDelete(new NextRequest('http://localhost/api/outside-work/ow-1', { method: 'DELETE' }), { params })
    expect(res.status).toBe(409)
  })
})

// ── 5. Tasks rejectedCount atomic increment ──────────────────────────────────

describe('PATCH /api/tasks/[id] — atomic rejectedCount increment + post-write escalation check (Phase B)', () => {
  const params = Promise.resolve({ id: 'task-1' })
  const task = {
    id: 'task-1', title: 'Test task', assigneeId: 'emp-1', assignedById: 'mgr-1',
    status: 'WAITING_REVIEW', rejectedCount: 1, progressNotes: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'mgr-1', name: 'Manager', role: 'MANAGER' } } as never)
    vi.mocked(prisma.taskAssignment.findUnique).mockResolvedValue(task as never)
  })

  it('increments rejectedCount atomically instead of writing task.rejectedCount + 1', async () => {
    vi.mocked(prisma.taskAssignment.update).mockResolvedValue({ ...task, rejectedCount: 2 } as never)
    await taskPatch(jsonReq('http://localhost/api/tasks/task-1', { status: 'REJECTED' }, 'PATCH'), { params })
    expect(prisma.taskAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rejectedCount: { increment: 1 } }) }),
    )
  })

  it('escalates to CEO using the real post-increment count, not a JS prediction', async () => {
    vi.mocked(prisma.taskAssignment.update).mockResolvedValue({ ...task, rejectedCount: 3 } as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'ceo-1' } as never)
    await taskPatch(jsonReq('http://localhost/api/tasks/task-1', { status: 'REJECTED' }, 'PATCH'), { params })
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'ceo-1', type: 'TASK_AUTOMATION_TRIGGERED' }),
    )
  })

  it('does not escalate when the real post-increment count is still below 3', async () => {
    vi.mocked(prisma.taskAssignment.update).mockResolvedValue({ ...task, rejectedCount: 2 } as never)
    await taskPatch(jsonReq('http://localhost/api/tasks/task-1', { status: 'REJECTED' }, 'PATCH'), { params })
    expect(prisma.user.findFirst).not.toHaveBeenCalled()
  })
})

// ── 6. Payment-appointment note-loss fix ─────────────────────────────────────

describe('PATCH /api/payment-appointments/[id] — note only written when provided (Phase B)', () => {
  const params = Promise.resolve({ id: 'appt-1' })
  const appt = {
    id: 'appt-1', note: 'existing note', appointDate: new Date('2026-07-01'), agreedAmount: 1000,
    debtor: { id: 'debtor-1', firstName: 'A', lastName: 'B', assignedToId: null },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'MANAGER' } } as never)
    vi.mocked(prisma.paymentAppointment.findUnique).mockResolvedValue(appt as never)
    vi.mocked(prisma.paymentAppointment.update).mockResolvedValue({ ...appt, status: 'KEPT' } as never)
  })

  it('does not include note in the update payload when the caller omits it', async () => {
    await paymentAppointmentPatch(jsonReq('http://localhost/api/payment-appointments/appt-1', { status: 'KEPT' }, 'PATCH'), { params })
    const call = vi.mocked(prisma.paymentAppointment.update).mock.calls[0][0]
    expect(call.data).not.toHaveProperty('note')
  })

  it('includes note in the update payload when the caller provides one', async () => {
    await paymentAppointmentPatch(jsonReq('http://localhost/api/payment-appointments/appt-1', { status: 'KEPT', note: 'new note' }, 'PATCH'), { params })
    const call = vi.mocked(prisma.paymentAppointment.update).mock.calls[0][0]
    expect(call.data).toMatchObject({ note: 'new note' })
  })
})

// ── 7. Invoice remainingAmount/status drift guard ────────────────────────────

describe('POST /api/invoices/[id]/payments — derived-fields write guarded on paidAmount (Phase B)', () => {
  const params = Promise.resolve({ id: 'inv-1' })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'fin-1', role: 'ADMIN' } } as never)
    vi.mocked(prisma.billingInvoice.findUnique).mockResolvedValue({ id: 'inv-1', totalAmount: 1000 } as never)
    vi.mocked(prisma.billingPayment.create).mockResolvedValue({ id: 'pay-1', amount: 300 } as never)
    vi.mocked(prisma.billingInvoice.update).mockResolvedValue({
      id: 'inv-1', totalAmount: 1000, paidAmount: 300, status: 'PENDING_PAYMENT',
    } as never)
  })

  it('guards the remainingAmount/status write on paidAmount matching the just-observed increment result', async () => {
    await invoicePaymentsPost(jsonReq('http://localhost/api/invoices/inv-1/payments', { amount: 300, paymentMethod: 'Bank Transfer' }), { params })
    expect(prisma.billingInvoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', paidAmount: 300 },
      data:  { remainingAmount: 700, status: 'PENDING_PAYMENT' },
    })
  })
})

// ── 8. client-companies PATCH permission gap ─────────────────────────────────

describe('PATCH /api/client-companies/[id] — role check closed (Phase B)', () => {
  const params = Promise.resolve({ id: 'cc-1' })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forbids a role outside CAN_MANAGE from editing a client company', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'emp-1', role: 'EMPLOYEE' } } as never)
    const res = await clientCompanyPatch(jsonReq('http://localhost/api/client-companies/cc-1', { creditLimit: 999999 }, 'PATCH'), { params })
    expect(res.status).toBe(403)
    expect(prisma.clientCompany.update).not.toHaveBeenCalled()
  })

  it('allows a CAN_MANAGE role to edit', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'adm-1', role: 'ADMIN' } } as never)
    vi.mocked(prisma.clientCompany.update).mockResolvedValue({ id: 'cc-1', creditLimit: 5000 } as never)
    const res = await clientCompanyPatch(jsonReq('http://localhost/api/client-companies/cc-1', { creditLimit: 5000 }, 'PATCH'), { params })
    expect(res.status).toBe(200)
    expect(prisma.clientCompany.update).toHaveBeenCalled()
  })
})

// ── 9. digital-signatures POST permission gap ────────────────────────────────

describe('POST /api/digital-signatures — CLIENT role blocked (Phase B)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ name: 'X', role: 'EMPLOYEE', position: null } as never)
    vi.mocked(prisma.digitalSignature.create).mockResolvedValue({ id: 'sig-1' } as never)
  })

  it('forbids a CLIENT session from creating a signature', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'client-1', role: 'CLIENT' } } as never)
    const res = await digitalSignaturePost(jsonReq('http://localhost/api/digital-signatures', { docType: 'ApprovalRequest', docId: 'doc-1', signatureType: 'TYPED', typedName: 'X' }))
    expect(res.status).toBe(403)
    expect(prisma.digitalSignature.create).not.toHaveBeenCalled()
  })

  it('allows a non-CLIENT authenticated user to sign', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'emp-1', role: 'EMPLOYEE' } } as never)
    const res = await digitalSignaturePost(jsonReq('http://localhost/api/digital-signatures', { docType: 'ApprovalRequest', docId: 'doc-1', signatureType: 'TYPED', typedName: 'X' }))
    expect(res.status).toBe(201)
  })
})
