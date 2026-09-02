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
  deleteMany: vi.fn(),
  findFirst: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    emergencyContact: {
      create: mocks.create, updateMany: mocks.updateMany, deleteMany: mocks.deleteMany, findFirst: mocks.findFirst,
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => {
      if (typeof fn === 'function') {
        return fn({ emergencyContact: { create: mocks.create, updateMany: mocks.updateMany } })
      }
      return Promise.resolve(fn)
    }),
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, requireEditOrgScope } from '@/lib/api-guard'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/notifications'
import { POST } from '@/app/api/users/[id]/emergency-contacts/route'
import { PATCH, DELETE } from '@/app/api/users/[id]/emergency-contacts/[contactId]/route'

function makePost(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/users/${id}/emergency-contacts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
function makePatch(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/users/${id}/emergency-contacts/c1`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
const params = (id: string, contactId = 'c1') => Promise.resolve({ id, contactId })
const hrSession = { user: { id: 'hr-1', role: 'HR', branchId: 'b1' } }

const validBody = { name: 'สมชาย', relationship: 'พี่ชาย', phone: '0812345678' }
const existingRow = { name: 'เก่า', relationship: 'เพื่อน', phone: '0800000000', altPhone: null, address: null, isPrimary: false }

describe('POST /api/users/[id]/emergency-contacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.emergencyContact.create).mockResolvedValue({ id: 'c1', ...validBody } as never)
    vi.mocked(prisma.emergencyContact.updateMany).mockResolvedValue({ count: 0 } as never)
  })

  it('403s a non-edit-scope viewer and never creates', async () => {
    vi.mocked(requireEditOrgScope).mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as never)
    const res = await POST(makePost('emp-9', validBody), { params: params('emp-9') })
    expect(res.status).toBe(403)
    expect(prisma.emergencyContact.create).not.toHaveBeenCalled()
  })

  it('400s an incomplete row', async () => {
    const res = await POST(makePost('emp-9', { name: '' }), { params: params('emp-9') })
    expect(res.status).toBe(400)
    expect(prisma.emergencyContact.create).not.toHaveBeenCalled()
  })

  it('creates a contact successfully', async () => {
    const res = await POST(makePost('emp-9', validBody), { params: params('emp-9') })
    expect(res.status).toBe(201)
    expect(prisma.emergencyContact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'emp-9', name: 'สมชาย' }) }),
    )
  })

  it('cascade-unsets any existing primary contact before creating a new primary one', async () => {
    await POST(makePost('emp-9', { ...validBody, isPrimary: true }), { params: params('emp-9') })
    expect(prisma.emergencyContact.updateMany).toHaveBeenCalledWith({
      where: { userId: 'emp-9', isPrimary: true }, data: { isPrimary: false },
    })
  })

  it('does not touch other contacts when the new one is not primary', async () => {
    await POST(makePost('emp-9', validBody), { params: params('emp-9') })
    expect(prisma.emergencyContact.updateMany).not.toHaveBeenCalled()
  })

  it('writes an audit log with a readable summary line', async () => {
    await POST(makePost('emp-9', validBody), { params: params('emp-9') })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'hr-1', targetId: 'emp-9', targetType: 'User', action: 'UPDATE',
        after: expect.objectContaining({
          subrecordEvent: true, entityType: 'EmergencyContact',
          lines: [expect.stringContaining('เพิ่มผู้ติดต่อฉุกเฉิน: สมชาย')],
        }),
      }),
    )
  })
})

describe('PATCH /api/users/[id]/emergency-contacts/[contactId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.emergencyContact.findFirst).mockResolvedValue(existingRow as never)
    vi.mocked(prisma.emergencyContact.updateMany).mockResolvedValue({ count: 1 } as never)
  })

  it('404s when the contact does not belong to this employee (ownership-scoped update)', async () => {
    vi.mocked(prisma.emergencyContact.findFirst).mockResolvedValue(null)
    const res = await PATCH(makePatch('emp-9', validBody), { params: params('emp-9') })
    expect(res.status).toBe(404)
    expect(prisma.emergencyContact.updateMany).not.toHaveBeenCalled()
  })

  it('updates successfully and scopes the query by both id and userId', async () => {
    const res = await PATCH(makePatch('emp-9', validBody), { params: params('emp-9') })
    expect(res.status).toBe(200)
    expect(prisma.emergencyContact.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'c1', userId: 'emp-9' } }),
    )
  })

  it('cascade-unsets any OTHER primary contact (excluding itself) when setting this one primary', async () => {
    await PATCH(makePatch('emp-9', { ...validBody, isPrimary: true }), { params: params('emp-9') })
    expect(prisma.emergencyContact.updateMany).toHaveBeenNthCalledWith(1, {
      where: { userId: 'emp-9', isPrimary: true, NOT: { id: 'c1' } }, data: { isPrimary: false },
    })
  })

  it('writes an audit log describing what changed, not a JSON dump', async () => {
    await PATCH(makePatch('emp-9', { ...existingRow, name: 'ใหม่' }), { params: params('emp-9') })
    const call = vi.mocked(createAuditLog).mock.calls[0][0]
    expect((call.after as { lines: string[] }).lines[0]).toContain('เก่า → ใหม่')
  })

  it('does not write an audit log when nothing actually changed', async () => {
    await PATCH(makePatch('emp-9', existingRow), { params: params('emp-9') })
    expect(createAuditLog).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/users/[id]/emergency-contacts/[contactId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireEditOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.emergencyContact.findFirst).mockResolvedValue(existingRow as never)
  })

  it('deletes for real (hard delete, no soft-delete for emergency contacts)', async () => {
    vi.mocked(prisma.emergencyContact.deleteMany).mockResolvedValue({ count: 1 } as never)
    const res = await DELETE(new NextRequest('http://localhost/x'), { params: params('emp-9') })
    expect(res.status).toBe(200)
    expect(prisma.emergencyContact.deleteMany).toHaveBeenCalledWith({ where: { id: 'c1', userId: 'emp-9' } })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ lines: [expect.stringContaining('ลบผู้ติดต่อฉุกเฉิน')] }) }),
    )
  })

  it('404s when nothing matched (wrong owner or already deleted)', async () => {
    vi.mocked(prisma.emergencyContact.findFirst).mockResolvedValue(null)
    const res = await DELETE(new NextRequest('http://localhost/x'), { params: params('emp-9') })
    expect(res.status).toBe(404)
    expect(createAuditLog).not.toHaveBeenCalled()
  })
})
