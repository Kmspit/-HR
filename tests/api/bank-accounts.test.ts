import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireEditOrgScope: vi.fn(),
  isGuardResponse: (v: unknown) => v instanceof Response,
}))

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  updateMany: vi.fn(),
  findFirst: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    bankAccount: { create: mocks.create, updateMany: mocks.updateMany, findFirst: mocks.findFirst },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => {
      if (typeof fn === 'function') {
        return fn({ bankAccount: { create: mocks.create, updateMany: mocks.updateMany } })
      }
      return Promise.resolve(fn)
    }),
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/field-crypto', () => ({
  encryptField: (v: string) => `enc:${v}`,
  decryptField: (blob: string) => blob.replace(/^enc:/, ''),
  FIELD_SALTS: { BANK_ACCOUNT: 'salt' },
}))

vi.mock('@/lib/module-gates', () => ({
  HR_ADMIN: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'],
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, requireEditOrgScope } from '@/lib/api-guard'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/notifications'
import { POST } from '@/app/api/users/[id]/bank-accounts/route'
import { PATCH } from '@/app/api/users/[id]/bank-accounts/[bankAccountId]/route'
import { GET as GET_SENSITIVE } from '@/app/api/users/[id]/bank-accounts/[bankAccountId]/sensitive/route'

function makePost(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/users/${id}/bank-accounts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
function makePatch(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/users/${id}/bank-accounts/b1`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
const params = (id: string, bankAccountId = 'b1') => Promise.resolve({ id, bankAccountId })
const hrSession = { user: { id: 'hr-1', role: 'HR', branchId: 'b1' } }
const managerSession = { user: { id: 'mgr-1', role: 'MANAGER', branchId: 'b1' } }

const validBody = { bankCode: 'SCB', accountNumber: '1234567890', accountName: 'สมชาย ใจดี' }
const existingRow = {
  bankCode: 'KTB', accountNameEnc: 'enc:ชื่อเก่า', accountNumberLast4: '4417',
  accountNumberEnc: 'enc:1112224417', accountType: null, isPrimary: false, isActive: true,
}

describe('POST /api/users/[id]/bank-accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.bankAccount.create).mockResolvedValue({
      id: 'b1', bankCode: 'SCB', accountNumberLast4: '7890', accountType: null, isPrimary: false, isActive: true,
    } as never)
    vi.mocked(prisma.bankAccount.updateMany).mockResolvedValue({ count: 0 } as never)
  })

  it('403s a non-edit-scope viewer', async () => {
    vi.mocked(requireEditOrgScope).mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as never)
    const res = await POST(makePost('emp-9', validBody), { params: params('emp-9') })
    expect(res.status).toBe(403)
    expect(prisma.bankAccount.create).not.toHaveBeenCalled()
  })

  it('400s an incomplete row', async () => {
    const res = await POST(makePost('emp-9', { bankCode: '' }), { params: params('emp-9') })
    expect(res.status).toBe(400)
  })

  it('creates a new account, always isActive:true, encrypted name+number, plain last4', async () => {
    const res = await POST(makePost('emp-9', validBody), { params: params('emp-9') })
    expect(res.status).toBe(201)
    expect(prisma.bankAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'emp-9', isActive: true,
          accountNameEnc: 'enc:สมชาย ใจดี', accountNumberEnc: 'enc:1234567890', accountNumberLast4: '7890',
        }),
      }),
    )
  })

  it('cascade-unsets any existing primary account before creating a new primary one', async () => {
    await POST(makePost('emp-9', { ...validBody, isPrimary: true }), { params: params('emp-9') })
    expect(prisma.bankAccount.updateMany).toHaveBeenCalledWith({
      where: { userId: 'emp-9', isPrimary: true }, data: { isPrimary: false },
    })
  })

  it('never returns the raw accountNumber/encrypted blobs — only what came back from Prisma plus the name it was given', async () => {
    const res = await POST(makePost('emp-9', validBody), { params: params('emp-9') })
    const raw = await res.text()
    expect(raw).not.toContain('accountNumberEnc')
    expect(raw).not.toContain('enc:1234567890')
  })

  it('writes an audit log — masked account number, never the raw digits', async () => {
    await POST(makePost('emp-9', validBody), { params: params('emp-9') })
    const call = vi.mocked(createAuditLog).mock.calls[0][0]
    const raw = JSON.stringify(call)
    expect(raw).not.toContain('1234567890')
    const line = (call.after as { lines: string[] }).lines[0]
    expect(line).toContain('เพิ่มบัญชีธนาคาร')
    expect(line).toContain('7890')
  })
})

describe('PATCH /api/users/[id]/bank-accounts/[bankAccountId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.bankAccount.findFirst).mockResolvedValue(existingRow as never)
    vi.mocked(prisma.bankAccount.updateMany).mockResolvedValue({ count: 1 } as never)
  })

  it('404s on ownership mismatch', async () => {
    vi.mocked(prisma.bankAccount.findFirst).mockResolvedValue(null)
    const res = await PATCH(makePatch('emp-9', validBody), { params: params('emp-9') })
    expect(res.status).toBe(404)
    expect(prisma.bankAccount.updateMany).not.toHaveBeenCalled()
  })

  it('an isActive:false-only PATCH (the "delete" button) never hard-deletes, just flips the flag', async () => {
    const res = await PATCH(makePatch('emp-9', { isActive: false }), { params: params('emp-9') })
    expect(res.status).toBe(200)
    const call = vi.mocked(prisma.bankAccount.updateMany).mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }
    expect(call.data.isActive).toBe(false)
  })

  it('disabling an account also clears isPrimary — a disabled account cannot stay marked primary', async () => {
    await PATCH(makePatch('emp-9', { isActive: false }), { params: params('emp-9') })
    const call = vi.mocked(prisma.bankAccount.updateMany).mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }
    expect(call.data.isPrimary).toBe(false)
  })

  it('logs a disable action distinctly from a generic edit', async () => {
    await PATCH(makePatch('emp-9', { isActive: false }), { params: params('emp-9') })
    const call = vi.mocked(createAuditLog).mock.calls[0][0]
    expect((call.after as { lines: string[] }).lines[0]).toContain('ปิดใช้งานบัญชีธนาคาร')
  })

  it('logs a reactivate action distinctly', async () => {
    vi.mocked(prisma.bankAccount.findFirst).mockResolvedValue({ ...existingRow, isActive: false } as never)
    await PATCH(makePatch('emp-9', { isActive: true }), { params: params('emp-9') })
    const call = vi.mocked(createAuditLog).mock.calls[0][0]
    expect((call.after as { lines: string[] }).lines[0]).toContain('เปิดใช้งานบัญชีธนาคารอีกครั้ง')
  })

  it('re-encrypts accountNumber only when explicitly present in the body', async () => {
    await PATCH(makePatch('emp-9', validBody), { params: params('emp-9') })
    const call = vi.mocked(prisma.bankAccount.updateMany).mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }
    expect(call.data.accountNumberEnc).toBe('enc:1234567890')
  })

  it('leaves accountNumber untouched when absent from the body', async () => {
    await PATCH(makePatch('emp-9', { bankCode: 'SCB', accountName: 'X' }), { params: params('emp-9') })
    const call = vi.mocked(prisma.bankAccount.updateMany).mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }
    expect('accountNumberEnc' in call.data).toBe(false)
  })

  it('cascade-unsets other primary accounts (excluding itself) when setting this one primary', async () => {
    await PATCH(makePatch('emp-9', { ...validBody, isPrimary: true }), { params: params('emp-9') })
    expect(prisma.bankAccount.updateMany).toHaveBeenNthCalledWith(1, {
      where: { userId: 'emp-9', isPrimary: true, NOT: { id: 'b1' } }, data: { isPrimary: false },
    })
  })

  it('audit-logs an accountNumber change as masked, never the raw digits', async () => {
    await PATCH(makePatch('emp-9', validBody), { params: params('emp-9') })
    const call = vi.mocked(createAuditLog).mock.calls[0][0]
    const raw = JSON.stringify(call)
    expect(raw).not.toContain('1234567890')
    expect((call.after as { lines: string[] }).lines.some((l) => l.startsWith('เลขบัญชี'))).toBe(true)
  })

  it('does not report a nationalId-style line when accountNumber is untouched', async () => {
    await PATCH(makePatch('emp-9', { bankCode: 'KTB', accountName: 'ชื่อเก่า' }), { params: params('emp-9') })
    // Nothing actually changed (same bankCode/accountName as existingRow) — no audit log at all.
    expect(createAuditLog).not.toHaveBeenCalled()
  })
})

describe('GET /api/users/[id]/bank-accounts/[bankAccountId]/sensitive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.bankAccount.findFirst).mockResolvedValue({ accountNumberEnc: 'enc:1234567890' } as never)
  })

  it('403s a role outside HR_ADMIN and logs the denial', async () => {
    vi.mocked(requireAuth).mockResolvedValue(managerSession as never)
    const res = await GET_SENSITIVE(new NextRequest('http://localhost/x'), { params: params('emp-9') })
    expect(res.status).toBe(403)
    expect(prisma.bankAccount.findFirst).not.toHaveBeenCalled()
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'mgr-1', targetId: 'emp-9', targetType: 'BankAccountSensitiveData', action: 'VIEW',
        after: expect.objectContaining({ result: 'FORBIDDEN', bankAccountId: 'b1' }),
      }),
    )
  })

  it('returns the decrypted accountNumber for HR_ADMIN and logs success', async () => {
    const res = await GET_SENSITIVE(new NextRequest('http://localhost/x'), { params: params('emp-9') })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.accountNumber).toBe('1234567890')
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'hr-1', targetId: 'emp-9', targetType: 'BankAccountSensitiveData', action: 'VIEW',
        after: expect.objectContaining({ result: 'SUCCESS', bankAccountId: 'b1' }),
      }),
    )
  })

  it('404s when the account does not belong to this employee', async () => {
    vi.mocked(prisma.bankAccount.findFirst).mockResolvedValue(null)
    const res = await GET_SENSITIVE(new NextRequest('http://localhost/x'), { params: params('emp-9') })
    expect(res.status).toBe(404)
  })
})
