import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  findFirst: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.findUnique, update: mocks.update, findFirst: mocks.findFirst },
  },
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  notifyRole: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/line-profile', () => ({
  parseLineFields: (input: { lineId?: string }) => ({ ok: true, lineId: input.lineId ?? null, lineUserId: null, lineDisplayName: null }),
  assertLineFieldsUnique: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/profile-avatar', () => ({
  isAvatarFile: vi.fn().mockReturnValue(true),
  storeProfileAvatar: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { notifyRole } from '@/lib/notifications'
import { PATCH } from '@/app/api/profile/route'

function makePatch(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/profile', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

const session = { user: { id: 'emp-9', role: 'EMPLOYEE' } }

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'emp-9', email: 'emp9@co.com', employeeId: 'E1', name: 'สมชาย ใจดี', prefix: 'นาย',
    nickname: null, phone: '0812345678', birthDate: null, nationalId: '1111111111111',
    profileImage: null, role: 'EMPLOYEE', status: 'ACTIVE', department: null, position: null,
    baseSalary: null, startDate: null, socialSecurity: true, lineId: '@x', lineUserId: null,
    lineDisplayName: null, createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

const validPayload = {
  prefix: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', nickname: '', email: 'emp9@co.com',
  phone: '0812345678', birthDate: '', nationalId: '1111111111111', lineId: '@x',
}

describe('PATCH /api/profile — nationalId self-edit notification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(session as never)
    mocks.findFirst.mockResolvedValue(null) // no duplicate phone/email/nationalId
  })

  it('does not notify HR when nationalId is unchanged', async () => {
    mocks.findUnique.mockResolvedValue(userRow())
    mocks.update.mockResolvedValue(userRow())
    const res = await PATCH(makePatch(validPayload))
    expect(res.status).toBe(200)
    expect(notifyRole).not.toHaveBeenCalled()
  })

  it('notifies MANAGER_HR when the employee changes their own nationalId', async () => {
    mocks.findUnique.mockResolvedValue(userRow({ nationalId: '1111111111111' }))
    mocks.update.mockResolvedValue(userRow({ nationalId: '2222222222222' }))
    const res = await PATCH(makePatch({ ...validPayload, nationalId: '2222222222222' }))
    expect(res.status).toBe(200)
    expect(notifyRole).toHaveBeenCalledWith(
      'MANAGER_HR', 'PROFILE_SENSITIVE_SELF_EDIT',
      expect.stringContaining('เลขบัตรประชาชน'),
      expect.stringContaining('สมชาย ใจดี'),
      expect.any(String),
    )
  })
})
