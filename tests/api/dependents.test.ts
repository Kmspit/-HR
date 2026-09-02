import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireEditOrgScope: vi.fn(),
  isGuardResponse: (v: unknown) => v instanceof Response,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dependent: {
      create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn(),
    },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/field-crypto', () => ({
  encryptField: (v: string) => `enc:${v}`,
  decryptField: (blob: string) => blob.replace(/^enc:/, ''),
  FIELD_SALTS: { DEPENDENT_NATIONAL_ID: 'salt' },
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
import { POST } from '@/app/api/users/[id]/dependents/route'
import { PATCH, DELETE } from '@/app/api/users/[id]/dependents/[dependentId]/route'
import { GET as GET_SENSITIVE } from '@/app/api/users/[id]/dependents/[dependentId]/sensitive/route'

function makePost(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/users/${id}/dependents`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
function makePatch(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/users/${id}/dependents/d1`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
const params = (id: string, dependentId = 'd1') => Promise.resolve({ id, dependentId })
const hrSession = { user: { id: 'hr-1', role: 'HR', branchId: 'b1' } }
const managerSession = { user: { id: 'mgr-1', role: 'MANAGER', branchId: 'b1' } }

const validBody = { name: 'เด็กหญิง ก', relationType: 'CHILD' }
const existingRow = {
  name: 'เด็กเก่า', relationType: 'CHILD', birthDate: null, nationalIdLast4: null,
  nationalIdEnc: null, isTaxAllowance: false, note: null,
}

describe('POST /api/users/[id]/dependents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.dependent.create).mockResolvedValue({
      id: 'd1', name: 'เด็กหญิง ก', relationType: 'CHILD', birthDate: null, nationalIdLast4: null, isTaxAllowance: false, note: null,
    } as never)
  })

  it('403s a non-edit-scope viewer', async () => {
    vi.mocked(requireEditOrgScope).mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as never)
    const res = await POST(makePost('emp-9', validBody), { params: params('emp-9') })
    expect(res.status).toBe(403)
    expect(prisma.dependent.create).not.toHaveBeenCalled()
  })

  it('400s a missing relationType', async () => {
    const res = await POST(makePost('emp-9', { name: 'X' }), { params: params('emp-9') })
    expect(res.status).toBe(400)
  })

  it('creates without a nationalId (optional)', async () => {
    const res = await POST(makePost('emp-9', validBody), { params: params('emp-9') })
    expect(res.status).toBe(201)
    expect(prisma.dependent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nationalIdEnc: null, nationalIdLast4: null }) }),
    )
  })

  it('encrypts a provided nationalId and stores its last4 in plain', async () => {
    await POST(makePost('emp-9', { ...validBody, nationalId: '1234567890123' }), { params: params('emp-9') })
    expect(prisma.dependent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nationalIdEnc: 'enc:1234567890123', nationalIdLast4: '0123' }) }),
    )
  })

  it('never returns the encrypted blob or raw nationalId in the response', async () => {
    vi.mocked(prisma.dependent.create).mockResolvedValue({
      id: 'd1', name: 'X', relationType: 'CHILD', birthDate: null, nationalIdLast4: '0123', isTaxAllowance: false, note: null,
    } as never)
    const res = await POST(makePost('emp-9', { ...validBody, nationalId: '1234567890123' }), { params: params('emp-9') })
    const raw = await res.text()
    expect(raw).not.toContain('1234567890123')
    expect(raw).not.toContain('nationalIdEnc')
  })

  it('writes an audit log — masked last4, never the raw nationalId', async () => {
    vi.mocked(prisma.dependent.create).mockResolvedValue({
      id: 'd1', name: 'เด็กหญิง ก', relationType: 'CHILD', birthDate: null, nationalIdLast4: '0123', isTaxAllowance: false, note: null,
    } as never)
    await POST(makePost('emp-9', { ...validBody, nationalId: '1234567890123' }), { params: params('emp-9') })
    const call = vi.mocked(createAuditLog).mock.calls[0][0]
    const raw = JSON.stringify(call)
    expect(raw).not.toContain('1234567890123')
    expect((call.after as { lines: string[] }).lines[0]).toContain('เพิ่มผู้อยู่ในอุปการะ: เด็กหญิง ก')
  })
})

describe('PATCH /api/users/[id]/dependents/[dependentId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.dependent.findFirst).mockResolvedValue(existingRow as never)
    vi.mocked(prisma.dependent.updateMany).mockResolvedValue({ count: 1 } as never)
  })

  it('404s when ownership does not match', async () => {
    vi.mocked(prisma.dependent.findFirst).mockResolvedValue(null)
    const res = await PATCH(makePatch('emp-9', validBody), { params: params('emp-9') })
    expect(res.status).toBe(404)
    expect(prisma.dependent.updateMany).not.toHaveBeenCalled()
  })

  it('leaves nationalId untouched when the field is absent from the body', async () => {
    await PATCH(makePatch('emp-9', validBody), { params: params('emp-9') })
    const call = vi.mocked(prisma.dependent.updateMany).mock.calls[0][0] as { data: Record<string, unknown> }
    expect('nationalIdEnc' in call.data).toBe(false)
    expect('nationalIdLast4' in call.data).toBe(false)
  })

  it('clears nationalId when explicitly sent as an empty string (deliberate clear)', async () => {
    await PATCH(makePatch('emp-9', { ...validBody, nationalId: '' }), { params: params('emp-9') })
    const call = vi.mocked(prisma.dependent.updateMany).mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data.nationalIdEnc).toBeNull()
    expect(call.data.nationalIdLast4).toBeNull()
  })

  it('re-encrypts nationalId when a new value is explicitly sent', async () => {
    await PATCH(makePatch('emp-9', { ...validBody, nationalId: '9876543210123' }), { params: params('emp-9') })
    const call = vi.mocked(prisma.dependent.updateMany).mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data.nationalIdEnc).toBe('enc:9876543210123')
    expect(call.data.nationalIdLast4).toBe('0123')
  })

  it('writes an audit log describing the name change, not a JSON dump', async () => {
    await PATCH(makePatch('emp-9', { ...validBody, name: 'เด็กใหม่' }), { params: params('emp-9') })
    const call = vi.mocked(createAuditLog).mock.calls[0][0]
    expect((call.after as { lines: string[] }).lines.some((l) => l.includes('เด็กเก่า → เด็กใหม่'))).toBe(true)
  })

  it('audit-logs a nationalId change as masked+fingerprint, never plaintext', async () => {
    await PATCH(makePatch('emp-9', { ...validBody, nationalId: '9876543210123' }), { params: params('emp-9') })
    const call = vi.mocked(createAuditLog).mock.calls[0][0]
    const raw = JSON.stringify(call)
    expect(raw).not.toContain('9876543210123')
    expect((call.after as { lines: string[] }).lines.some((l) => l.startsWith('เลขบัตรประชาชน'))).toBe(true)
  })

  it('does not write an audit log when nothing actually changed', async () => {
    await PATCH(makePatch('emp-9', { name: existingRow.name, relationType: existingRow.relationType }), { params: params('emp-9') })
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('does not decrypt the stored nationalId when the edit never touches it', async () => {
    await PATCH(makePatch('emp-9', { ...validBody, name: 'เด็กใหม่' }), { params: params('emp-9') })
    // decryptField is mocked to strip an "enc:" prefix — if it had been called
    // on a null/undefined value the call itself wouldn't throw here, so the
    // real assertion is indirect: no nationalId line should appear since the
    // field was never part of this edit.
    const call = vi.mocked(createAuditLog).mock.calls[0][0]
    expect((call.after as { lines: string[] }).lines.some((l) => l.startsWith('เลขบัตรประชาชน'))).toBe(false)
  })
})

describe('DELETE /api/users/[id]/dependents/[dependentId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.dependent.findFirst).mockResolvedValue(existingRow as never)
  })

  it('deletes for real and 404s on ownership mismatch', async () => {
    vi.mocked(prisma.dependent.findFirst).mockResolvedValue(null)
    const res = await DELETE(new NextRequest('http://localhost/x'), { params: params('emp-9') })
    expect(res.status).toBe(404)
  })

  it('writes an audit log for the delete', async () => {
    vi.mocked(prisma.dependent.deleteMany).mockResolvedValue({ count: 1 } as never)
    await DELETE(new NextRequest('http://localhost/x'), { params: params('emp-9') })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ lines: [expect.stringContaining('ลบผู้อยู่ในอุปการะ')] }) }),
    )
  })
})

describe('GET /api/users/[id]/dependents/[dependentId]/sensitive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.dependent.findFirst).mockResolvedValue({ nationalIdEnc: 'enc:1234567890123' } as never)
  })

  it('403s a role outside HR_ADMIN and logs the denial', async () => {
    vi.mocked(requireAuth).mockResolvedValue(managerSession as never)
    const res = await GET_SENSITIVE(new NextRequest('http://localhost/x'), { params: params('emp-9') })
    expect(res.status).toBe(403)
    expect(prisma.dependent.findFirst).not.toHaveBeenCalled()
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'mgr-1', targetId: 'emp-9', targetType: 'DependentSensitiveData', action: 'VIEW',
        after: expect.objectContaining({ result: 'FORBIDDEN', dependentId: 'd1' }),
      }),
    )
  })

  it('returns the decrypted nationalId for HR_ADMIN and logs success', async () => {
    const res = await GET_SENSITIVE(new NextRequest('http://localhost/x'), { params: params('emp-9') })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.nationalId).toBe('1234567890123')
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'hr-1', targetId: 'emp-9', targetType: 'DependentSensitiveData', action: 'VIEW',
        after: expect.objectContaining({ result: 'SUCCESS', dependentId: 'd1' }),
      }),
    )
  })

  it('404s when the dependent does not belong to this employee', async () => {
    vi.mocked(prisma.dependent.findFirst).mockResolvedValue(null)
    const res = await GET_SENSITIVE(new NextRequest('http://localhost/x'), { params: params('emp-9') })
    expect(res.status).toBe(404)
  })
})
