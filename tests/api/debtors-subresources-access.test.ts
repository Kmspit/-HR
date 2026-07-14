import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    debtor:              { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    paymentAppointment:   { findMany: vi.fn(), create: vi.fn() },
    debtorFile:           { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    debtFollowUp:         { findMany: vi.fn(), create: vi.fn() },
    debtPayment:          { findMany: vi.fn() },
    debtorContact:        { findMany: vi.fn(), create: vi.fn() },
    promiseToPay:         { findMany: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('@/lib/notifications', () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
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
import { GET as promiseGet, POST as promisePost } from '@/app/api/debtors/[id]/promises/route'

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

describe('debtors/[id] sub-resources — ownership check (CAN_MANAGE || assignedToId === userId)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.debtor.findUnique).mockResolvedValue({
      assignedToId: 'collector-1', paidAmount: 0, totalDebt: 10000,
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
