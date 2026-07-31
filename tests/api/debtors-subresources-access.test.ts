import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    debtor:              { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    paymentAppointment:   { findMany: vi.fn(), create: vi.fn() },
    debtorFile:           { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    debtFollowUp:         { findMany: vi.fn(), create: vi.fn() },
    debtPayment:          { findMany: vi.fn(), create: vi.fn() },
    debtorContact:        { findMany: vi.fn(), create: vi.fn() },
    promiseToPay:         { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $transaction:         vi.fn((cb: any) => cb(prisma)),
  }
  return { prisma }
})

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createAuditLog:      vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/automation-engine', () => ({ triggerAutomation: vi.fn().mockReturnValue({ catch: () => undefined }) }))
vi.mock('cloudinary', () => ({ v2: { config: vi.fn(), uploader: { upload: vi.fn(), destroy: vi.fn() } } }))
vi.mock('@/lib/api-guard', () => ({ requireCsrf: vi.fn().mockReturnValue(null) }))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: vi.fn() }
})

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET as debtorGet } from '@/app/api/debtors/[id]/route'
import { GET as apptGet, POST as apptPost } from '@/app/api/debtors/[id]/appointments/route'
import { GET as fileGet, POST as filePost, DELETE as fileDelete } from '@/app/api/debtors/[id]/files/route'
import { GET as followupGet, POST as followupPost } from '@/app/api/debtors/[id]/followups/route'
import { GET as paymentGet, POST as paymentPost } from '@/app/api/debtors/[id]/payments/route'
import { GET as contactGet, POST as contactPost } from '@/app/api/debtors/[id]/contacts/route'
import { GET as promiseGet, POST as promisePost, PATCH as promisePatch } from '@/app/api/debtors/[id]/promises/route'
import { createAuditLog } from '@/lib/notifications'

const params = Promise.resolve({ id: 'debtor-1' })
const collectorSession = { user: { id: 'collector-1', role: 'ENFORCEMENT' } }
const strangerSession  = { user: { id: 'stranger-1', role: 'ENFORCEMENT' } }
const managerSession   = { user: { id: 'mgr-1', role: 'MANAGER_HR' } }

function makeGetReq() {
  return new NextRequest('http://localhost/api/debtors/debtor-1/x')
}
function makePostReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/debtors/debtor-1/x', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
function makePatchReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/debtors/debtor-1/x', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('debtors/[id] sub-resources — ownership check (CAN_MANAGE || assignedToId === userId)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.debtor.findUnique).mockResolvedValue({
      assignedToId: 'collector-1', paidAmount: 0, totalDebt: 10000, remainingDebt: 10000,
      firstName: 'x', lastName: 'y',
    } as never)
    vi.mocked(prisma.paymentAppointment.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.debtorFile.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.debtFollowUp.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.debtPayment.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.debtorContact.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.promiseToPay.findMany).mockResolvedValue([] as never)
  })

  describe.each([
    ['debtors/[id] GET',           () => debtorGet(makeGetReq(), { params })],
    ['appointments GET',           () => apptGet(makeGetReq(), { params })],
    ['files GET',                  () => fileGet(makeGetReq(), { params })],
    ['followups GET',              () => followupGet(makeGetReq(), { params })],
    ['payments GET',               () => paymentGet(makeGetReq(), { params })],
    ['contacts GET',               () => contactGet(makeGetReq(), { params })],
    ['promises GET',               () => promiseGet(makeGetReq(), { params })],
  ] as const)('%s', (_name, call) => {
    it('forbids a stranger (not assigned, not a manage role)', async () => {
      vi.mocked(auth).mockResolvedValue(strangerSession as never)
      const res = await call()
      expect(res.status).toBe(403)
    })

    it('allows the assigned collector', async () => {
      vi.mocked(auth).mockResolvedValue(collectorSession as never)
      const res = await call()
      expect(res.status).toBe(200)
    })

    it('allows a company-wide manage role regardless of assignment', async () => {
      vi.mocked(auth).mockResolvedValue(managerSession as never)
      const res = await call()
      expect(res.status).toBe(200)
    })
  })

  describe('POST/DELETE mutation endpoints', () => {
    beforeEach(() => {
      vi.mocked(prisma.paymentAppointment.create).mockResolvedValue({ id: 'a1' } as never)
      vi.mocked(prisma.debtFollowUp.create).mockResolvedValue({ id: 'f1' } as never)
      vi.mocked(prisma.debtorFile.create).mockResolvedValue({ id: 'df1' } as never)
      vi.mocked(prisma.debtorFile.findUnique).mockResolvedValue({ id: 'df1', debtorId: 'debtor-1', publicId: null } as never)
      vi.mocked(prisma.promiseToPay.create).mockResolvedValue({ id: 'p1' } as never)
      vi.mocked(prisma.debtorContact.create).mockResolvedValue({ id: 'c1' } as never)
    })

    it('promises POST forbids a LAWYER/ENFORCEMENT stranger (not assigned to this debtor) — same as GET', async () => {
      vi.mocked(auth).mockResolvedValue(strangerSession as never)
      const res = await promisePost(makePostReq({ promisedAmount: 1000, promisedDate: '2026-08-01' }), { params })
      expect(res.status).toBe(403)
      expect(prisma.promiseToPay.create).not.toHaveBeenCalled()
    })

    it('promises POST allows the assigned collector', async () => {
      vi.mocked(auth).mockResolvedValue(collectorSession as never)
      const res = await promisePost(makePostReq({ promisedAmount: 1000, promisedDate: '2026-08-01' }), { params })
      expect(res.status).toBe(201)
      expect(prisma.promiseToPay.create).toHaveBeenCalled()
    })

    it('promises POST still allows a company-wide role regardless of assignment', async () => {
      vi.mocked(auth).mockResolvedValue(managerSession as never)
      const res = await promisePost(makePostReq({ promisedAmount: 1000, promisedDate: '2026-08-01' }), { params })
      expect(res.status).toBe(201)
    })

    describe('promises PATCH — audit trail', () => {
      beforeEach(() => {
        vi.mocked(auth).mockResolvedValue(managerSession as never)
        vi.mocked(prisma.promiseToPay.findFirst).mockResolvedValue({
          id: 'p1', debtorId: 'debtor-1', status: 'PENDING', actualAmount: null, actualDate: null,
        } as never)
        vi.mocked(prisma.promiseToPay.update).mockResolvedValue({
          id: 'p1', debtorId: 'debtor-1', status: 'KEPT', actualAmount: 1000, actualDate: new Date('2026-08-01'),
          promisedAmount: 1000, promisedDate: new Date('2026-08-01'),
        } as never)
      })

      it('rejects BROKEN with no reason', async () => {
        const res = await promisePatch(makePatchReq({ promiseId: 'p1', status: 'BROKEN' }), { params })
        expect(res.status).toBe(400)
        expect(prisma.promiseToPay.update).not.toHaveBeenCalled()
      })

      it('rejects CANCELLED with a blank/whitespace reason', async () => {
        const res = await promisePatch(makePatchReq({ promiseId: 'p1', status: 'CANCELLED', reason: '   ' }), { params })
        expect(res.status).toBe(400)
        expect(prisma.promiseToPay.update).not.toHaveBeenCalled()
      })

      it('accepts BROKEN with a reason and writes an audit log capturing before/after + reason', async () => {
        vi.mocked(prisma.promiseToPay.update).mockResolvedValueOnce({
          id: 'p1', debtorId: 'debtor-1', status: 'BROKEN', actualAmount: null, actualDate: null,
          promisedAmount: 1000, promisedDate: new Date('2026-08-01'),
        } as never)
        const res = await promisePatch(makePatchReq({ promiseId: 'p1', status: 'BROKEN', reason: 'ลูกหนี้ไม่รับสาย' }), { params })
        expect(res.status).toBe(200)
        expect(createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            targetId:   'p1',
            targetType: 'PromiseToPay',
            action:     'UPDATE',
            before:     expect.objectContaining({ status: 'PENDING' }),
            after:      expect.objectContaining({ status: 'BROKEN', reason: 'ลูกหนี้ไม่รับสาย' }),
          }),
        )
      })

      it('does not require a reason for KEPT and still writes an audit log', async () => {
        const res = await promisePatch(makePatchReq({ promiseId: 'p1', status: 'KEPT', actualAmount: 1000, actualDate: '2026-08-01' }), { params })
        expect(res.status).toBe(200)
        expect(createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({ after: expect.objectContaining({ status: 'KEPT', reason: null }) }),
        )
      })

      it('returns 404 instead of throwing when the promise does not belong to this debtor', async () => {
        vi.mocked(prisma.promiseToPay.findFirst).mockResolvedValueOnce(null)
        const res = await promisePatch(makePatchReq({ promiseId: 'wrong-id', status: 'KEPT' }), { params })
        expect(res.status).toBe(404)
        expect(prisma.promiseToPay.update).not.toHaveBeenCalled()
      })
    })

    it('contacts POST forbids a LAWYER/ENFORCEMENT stranger (not assigned to this debtor) — same as GET', async () => {
      vi.mocked(auth).mockResolvedValue(strangerSession as never)
      const res = await contactPost(makePostReq({ channel: 'PHONE', result: 'ติดต่อได้' }), { params })
      expect(res.status).toBe(403)
      expect(prisma.debtorContact.create).not.toHaveBeenCalled()
    })

    it('contacts POST allows the assigned collector', async () => {
      vi.mocked(auth).mockResolvedValue(collectorSession as never)
      const res = await contactPost(makePostReq({ channel: 'PHONE', result: 'ติดต่อได้' }), { params })
      expect(res.status).toBe(201)
      expect(prisma.debtorContact.create).toHaveBeenCalled()
    })

    it('contacts POST still allows a company-wide role regardless of assignment', async () => {
      vi.mocked(auth).mockResolvedValue(managerSession as never)
      const res = await contactPost(makePostReq({ channel: 'PHONE', result: 'ติดต่อได้' }), { params })
      expect(res.status).toBe(201)
    })

    it('appointments POST forbids a stranger', async () => {
      vi.mocked(auth).mockResolvedValue(strangerSession as never)
      const res = await apptPost(makePostReq({ appointDate: '2026-08-01' }), { params })
      expect(res.status).toBe(403)
      expect(prisma.paymentAppointment.create).not.toHaveBeenCalled()
    })

    it('appointments POST allows the assigned collector', async () => {
      vi.mocked(auth).mockResolvedValue(collectorSession as never)
      const res = await apptPost(makePostReq({ appointDate: '2026-08-01' }), { params })
      expect(res.status).toBe(201)
    })

    it('followups POST forbids a stranger', async () => {
      vi.mocked(auth).mockResolvedValue(strangerSession as never)
      const res = await followupPost(makePostReq({ method: 'CALL', followedAt: '2026-08-01', result: 'x' }), { params })
      expect(res.status).toBe(403)
      expect(prisma.debtFollowUp.create).not.toHaveBeenCalled()
    })

    it('payments POST forbids a stranger', async () => {
      vi.mocked(auth).mockResolvedValue(strangerSession as never)
      const res = await paymentPost(makePostReq({ amount: 100, paidAt: '2026-08-01', channel: 'CASH' }), { params })
      expect(res.status).toBe(403)
    })

    describe('payments POST — balance write is atomic, never a stale absolute overwrite', () => {
      beforeEach(() => {
        vi.mocked(auth).mockResolvedValue(collectorSession as never)
        vi.mocked(prisma.debtPayment.create).mockResolvedValue({ id: 'pay-1' } as never)
      })

      it('increments/decrements atomically and only writes status (not remainingDebt) when the balance stays non-negative', async () => {
        // Simulates the atomic decrement itself already reflecting a concurrent
        // payment's effect (e.g. balance was 1000, this payment is 300, but
        // another payment already took it to 700 before this one's atomic
        // decrement runs — Prisma's own atomic increment/decrement guarantees
        // the DB-level arithmetic is correct regardless; what matters here is
        // that our code branches on the value it just wrote, not a stale one).
        vi.mocked(prisma.debtor.update).mockResolvedValueOnce({ remainingDebt: 400, paidAmount: 600 } as never)

        const res = await paymentPost(makePostReq({ amount: 300, paidAt: '2026-08-01', channel: 'CASH' }), { params })
        expect(res.status).toBe(201)

        const updateCalls = vi.mocked(prisma.debtor.update).mock.calls
        expect(updateCalls).toHaveLength(2)
        // First call: the atomic increment/decrement only.
        expect(updateCalls[0][0].data).toEqual({
          paidAmount:    { increment: 300 },
          remainingDebt: { decrement: 300 },
        })
        // Second call: status only — remainingDebt must NOT be re-asserted
        // here, since that's exactly the stale-overwrite bug being fixed.
        expect(updateCalls[1][0].data).toEqual({ status: 'PARTIAL_PAYMENT' })
      })

      it('marks PAID and floor-clamps remainingDebt to 0 only when the atomic decrement actually went negative', async () => {
        vi.mocked(prisma.debtor.update).mockResolvedValueOnce({ remainingDebt: -200, paidAmount: 1200 } as never)

        const res = await paymentPost(makePostReq({ amount: 1200, paidAt: '2026-08-01', channel: 'CASH' }), { params })
        expect(res.status).toBe(201)

        const updateCalls = vi.mocked(prisma.debtor.update).mock.calls
        expect(updateCalls[1][0].data).toEqual({ remainingDebt: 0, status: 'PAID' })
      })

      it('creates the DebtPayment record with the submitted amount', async () => {
        vi.mocked(prisma.debtor.update).mockResolvedValueOnce({ remainingDebt: 700, paidAmount: 300 } as never)
        await paymentPost(makePostReq({ amount: 300, paidAt: '2026-08-01', channel: 'CASH' }), { params })
        expect(prisma.debtPayment.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ amount: 300, debtorId: 'debtor-1' }) }),
        )
      })

      it('rejects an amount exceeding remainingDebt with 400 and does not write anything', async () => {
        vi.mocked(prisma.debtor.findUnique).mockResolvedValue({
          assignedToId: 'collector-1', paidAmount: 0, totalDebt: 10000, remainingDebt: 1000,
          firstName: 'x', lastName: 'y',
        } as never)

        const res = await paymentPost(makePostReq({ amount: 5000, paidAt: '2026-08-01', channel: 'CASH' }), { params })
        expect(res.status).toBe(400)
        const data = await res.json()
        expect(data.error).toBe('AMOUNT_EXCEEDS_REMAINING_DEBT')
        expect(data.remainingDebt).toBe(1000)
        expect(prisma.debtor.update).not.toHaveBeenCalled()
        expect(prisma.debtPayment.create).not.toHaveBeenCalled()
      })

      it('allows an amount exceeding remainingDebt when confirmOverpayment is explicitly set', async () => {
        vi.mocked(prisma.debtor.findUnique).mockResolvedValue({
          assignedToId: 'collector-1', paidAmount: 0, totalDebt: 10000, remainingDebt: 1000,
          firstName: 'x', lastName: 'y',
        } as never)
        vi.mocked(prisma.debtor.update).mockResolvedValueOnce({ remainingDebt: -4000, paidAmount: 5000 } as never)

        const res = await paymentPost(
          makePostReq({ amount: 5000, paidAt: '2026-08-01', channel: 'CASH', confirmOverpayment: true }),
          { params },
        )
        expect(res.status).toBe(201)
        expect(prisma.debtPayment.create).toHaveBeenCalled()
      })

      it('does not require confirmOverpayment when the amount exactly matches remainingDebt', async () => {
        vi.mocked(prisma.debtor.findUnique).mockResolvedValue({
          assignedToId: 'collector-1', paidAmount: 0, totalDebt: 10000, remainingDebt: 1000,
          firstName: 'x', lastName: 'y',
        } as never)
        vi.mocked(prisma.debtor.update).mockResolvedValueOnce({ remainingDebt: 0, paidAmount: 1000 } as never)

        const res = await paymentPost(makePostReq({ amount: 1000, paidAt: '2026-08-01', channel: 'CASH' }), { params })
        expect(res.status).toBe(201)
      })
    })

    it('files DELETE forbids a stranger', async () => {
      vi.mocked(auth).mockResolvedValue(strangerSession as never)
      const res = await fileDelete(
        new NextRequest('http://localhost/api/debtors/debtor-1/files', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: 'df1' }),
        }),
        { params },
      )
      expect(res.status).toBe(403)
      expect(prisma.debtorFile.delete).not.toHaveBeenCalled()
    })

    it('files POST allows the assigned collector', async () => {
      vi.mocked(auth).mockResolvedValue(collectorSession as never)
      const formData = new FormData()
      formData.append('file', new File(['x'], 'a.pdf', { type: 'application/pdf' }))
      const req = new NextRequest('http://localhost/api/debtors/debtor-1/files', { method: 'POST', body: formData })
      // upload() call inside route needs a resolved value
      const cloudinary = (await import('cloudinary')).v2
      vi.mocked(cloudinary.uploader.upload).mockResolvedValue({ secure_url: 'https://x', public_id: 'p1' } as never)
      const res = await filePost(req, { params })
      expect(res.status).toBe(201)
    })
  })

  it('returns 404 for a nonexistent debtor before checking permission', async () => {
    vi.mocked(auth).mockResolvedValue(managerSession as never)
    vi.mocked(prisma.debtor.findUnique).mockResolvedValue(null as never)
    const res = await apptGet(makeGetReq(), { params })
    expect(res.status).toBe(404)
  })
})
