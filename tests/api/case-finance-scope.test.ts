import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    caseExpense: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
    caseIncome:  { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
    user:        { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/utils', () => ({
  parsePositiveAmount: (v: unknown) => (typeof v === 'number' && v > 0 ? v : null),
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET as expensesListGet } from '@/app/api/case-finance/expenses/route'
import { GET as expenseGet, PATCH as expensePatch, DELETE as expenseDelete } from '@/app/api/case-finance/expenses/[id]/route'
import { GET as incomeListGet } from '@/app/api/case-finance/income/route'
import { GET as incomeGet, PATCH as incomePatch, DELETE as incomeDelete } from '@/app/api/case-finance/income/[id]/route'

const params = Promise.resolve({ id: 'item-1' })

const mgrInScope    = { user: { id: 'mgr-1', role: 'MANAGER', branchId: null } }
const mgrOutOfScope = { user: { id: 'mgr-2', role: 'MANAGER', branchId: null } }
const hrSession     = { user: { id: 'hr-1', role: 'MANAGER_HR', branchId: null } }

function getReq(url = 'http://localhost/api/case-finance/expenses') {
  return new NextRequest(url)
}
function patchReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/x', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('case-finance/expenses — org-scope leak fix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.caseExpense.findMany).mockResolvedValue([])
    vi.mocked(prisma.caseExpense.count).mockResolvedValue(0)
    // mgr-1's direct report is 'rep-1'; mgr-2 has no reports.
    vi.mocked(prisma.user.findMany).mockImplementation(((({ where }: any) =>
      Promise.resolve(where?.managerId === 'mgr-1' ? [{ id: 'rep-1' }] : [])) as never))
  })

  it('list GET scopes a MANAGER to their own id + direct reports, not company-wide', async () => {
    vi.mocked(auth).mockResolvedValue(mgrInScope as never)
    const res = await expensesListGet(getReq())
    expect(res.status).toBe(200)
    const call = vi.mocked(prisma.caseExpense.findMany).mock.calls[0][0] as any
    expect(call.where.employeeId).toEqual({ in: ['mgr-1', 'rep-1'] })
  })

  it('list GET does not scope a company-wide role (MANAGER_HR)', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    const res = await expensesListGet(getReq())
    expect(res.status).toBe(200)
    const call = vi.mocked(prisma.caseExpense.findMany).mock.calls[0][0] as any
    expect(call.where.employeeId).toBeUndefined()
  })

  it('single GET forbids a MANAGER whose report does not own the record', async () => {
    vi.mocked(auth).mockResolvedValue(mgrOutOfScope as never)
    vi.mocked(prisma.caseExpense.findUnique).mockResolvedValue({ id: 'item-1', employeeId: 'rep-1' } as never)
    const res = await expenseGet(getReq(), { params })
    expect(res.status).toBe(403)
  })

  it('single GET allows a MANAGER whose direct report owns the record', async () => {
    vi.mocked(auth).mockResolvedValue(mgrInScope as never)
    vi.mocked(prisma.caseExpense.findUnique).mockResolvedValue({ id: 'item-1', employeeId: 'rep-1' } as never)
    const res = await expenseGet(getReq(), { params })
    expect(res.status).toBe(200)
  })

  it('single GET allows a MANAGER viewing their OWN reimbursement (self, not a direct report)', async () => {
    // canApproverActOnRequester alone only checks the direct-reports list —
    // this specifically exercises the self-inclusion fix layered on top of it.
    vi.mocked(auth).mockResolvedValue(mgrInScope as never)
    vi.mocked(prisma.caseExpense.findUnique).mockResolvedValue({ id: 'item-1', employeeId: 'mgr-1' } as never)
    const res = await expenseGet(getReq(), { params })
    expect(res.status).toBe(200)
  })

  it('PATCH forbids a MANAGER acting on an out-of-scope employee\'s record', async () => {
    vi.mocked(auth).mockResolvedValue(mgrOutOfScope as never)
    vi.mocked(prisma.caseExpense.findUnique).mockResolvedValue({ employeeId: 'rep-1' } as never)
    const res = await expensePatch(patchReq({ amount: 500 }), { params })
    expect(res.status).toBe(403)
    expect(prisma.caseExpense.update).not.toHaveBeenCalled()
  })

  it('PATCH allows a MANAGER acting on their own direct report\'s record', async () => {
    vi.mocked(auth).mockResolvedValue(mgrInScope as never)
    vi.mocked(prisma.caseExpense.findUnique).mockResolvedValue({ employeeId: 'rep-1' } as never)
    vi.mocked(prisma.caseExpense.update).mockResolvedValue({ id: 'item-1' } as never)
    const res = await expensePatch(patchReq({ amount: 500 }), { params })
    expect(res.status).toBe(200)
    expect(prisma.caseExpense.update).toHaveBeenCalled()
  })

  it('DELETE forbids a MANAGER acting on an out-of-scope employee\'s record', async () => {
    vi.mocked(auth).mockResolvedValue(mgrOutOfScope as never)
    vi.mocked(prisma.caseExpense.findUnique).mockResolvedValue({ employeeId: 'rep-1' } as never)
    const res = await expenseDelete(getReq(), { params })
    expect(res.status).toBe(403)
    expect(prisma.caseExpense.delete).not.toHaveBeenCalled()
  })

  it('DELETE allows a company-wide role regardless of assignment', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.caseExpense.findUnique).mockResolvedValue({ employeeId: 'rep-1' } as never)
    const res = await expenseDelete(getReq(), { params })
    expect(res.status).toBe(200)
    expect(prisma.caseExpense.delete).toHaveBeenCalled()
  })
})

describe('case-finance/income — org-scope leak fix (scoped by createdById)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.caseIncome.findMany).mockResolvedValue([])
    vi.mocked(prisma.caseIncome.count).mockResolvedValue(0)
    vi.mocked(prisma.user.findMany).mockImplementation(((({ where }: any) =>
      Promise.resolve(where?.managerId === 'mgr-1' ? [{ id: 'rep-1' }] : [])) as never))
  })

  it('list GET scopes a MANAGER to their own id + direct reports by createdById', async () => {
    vi.mocked(auth).mockResolvedValue(mgrInScope as never)
    const res = await incomeListGet(getReq('http://localhost/api/case-finance/income'))
    expect(res.status).toBe(200)
    const call = vi.mocked(prisma.caseIncome.findMany).mock.calls[0][0] as any
    expect(call.where.createdById).toEqual({ in: ['mgr-1', 'rep-1'] })
  })

  it('single GET forbids a MANAGER outside the creator\'s scope', async () => {
    vi.mocked(auth).mockResolvedValue(mgrOutOfScope as never)
    vi.mocked(prisma.caseIncome.findUnique).mockResolvedValue({ id: 'item-1', createdById: 'rep-1' } as never)
    const res = await incomeGet(getReq(), { params })
    expect(res.status).toBe(403)
  })

  it('single GET allows a MANAGER viewing income they created themselves', async () => {
    vi.mocked(auth).mockResolvedValue(mgrInScope as never)
    vi.mocked(prisma.caseIncome.findUnique).mockResolvedValue({ id: 'item-1', createdById: 'mgr-1' } as never)
    const res = await incomeGet(getReq(), { params })
    expect(res.status).toBe(200)
  })

  it('PATCH forbids a MANAGER outside the creator\'s scope', async () => {
    vi.mocked(auth).mockResolvedValue(mgrOutOfScope as never)
    vi.mocked(prisma.caseIncome.findUnique).mockResolvedValue({ createdById: 'rep-1' } as never)
    const res = await incomePatch(patchReq({ amount: 500 }), { params })
    expect(res.status).toBe(403)
    expect(prisma.caseIncome.update).not.toHaveBeenCalled()
  })

  it('DELETE allows a company-wide role regardless of who created it', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.caseIncome.findUnique).mockResolvedValue({ createdById: 'rep-1' } as never)
    const res = await incomeDelete(getReq(), { params })
    expect(res.status).toBe(200)
    expect(prisma.caseIncome.delete).toHaveBeenCalled()
  })
})
