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

// Checksum-valid synthetic test vectors (see tests/lib/national-id.test.ts) — not
// real people's IDs.
const VALID_NATIONAL_ID = '1101700207366'
const VALID_NATIONAL_ID_2 = '3101999123453'

function yearsAgo(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'emp-9', email: 'emp9@co.com', employeeId: 'E1', name: 'สมชาย ใจดี', prefix: 'นาย',
    nickname: null, phone: '0812345678', birthDate: null, nationalId: VALID_NATIONAL_ID,
    profileImage: null, role: 'EMPLOYEE', status: 'ACTIVE', department: null, position: null,
    baseSalary: null, startDate: null, socialSecurity: true, lineId: '@x', lineUserId: null,
    lineDisplayName: null, createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

const validPayload = {
  prefix: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', nickname: '', email: 'emp9@co.com',
  phone: '0812345678', birthDate: '', nationalId: VALID_NATIONAL_ID, lineId: '@x',
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
    mocks.findUnique.mockResolvedValue(userRow({ nationalId: VALID_NATIONAL_ID }))
    mocks.update.mockResolvedValue(userRow({ nationalId: VALID_NATIONAL_ID_2 }))
    const res = await PATCH(makePatch({ ...validPayload, nationalId: VALID_NATIONAL_ID_2 }))
    expect(res.status).toBe(200)
    expect(notifyRole).toHaveBeenCalledWith(
      'MANAGER_HR', 'PROFILE_SENSITIVE_SELF_EDIT',
      expect.stringContaining('เลขบัตรประชาชน'),
      expect.stringContaining('สมชาย ใจดี'),
      expect.any(String),
    )
  })
})

describe('PATCH /api/profile — backlog 4.1: server-side nationalId checksum, only on actual change', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(session as never)
    mocks.findFirst.mockResolvedValue(null)
  })

  it('rejects a format-valid (13-digit) but checksum-invalid nationalId when it differs from the stored value', async () => {
    mocks.findUnique.mockResolvedValue(userRow({ nationalId: VALID_NATIONAL_ID }))
    const res = await PATCH(makePatch({ ...validPayload, nationalId: '1234567890123' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('เลขตรวจสอบไม่ตรง')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('does NOT re-validate checksum when the employee resubmits their existing (already checksum-invalid) nationalId unchanged', async () => {
    mocks.findUnique.mockResolvedValue(userRow({ nationalId: '1234567890123' }))
    mocks.update.mockResolvedValue(userRow({ nationalId: '1234567890123' }))
    const res = await PATCH(makePatch({ ...validPayload, nationalId: '1234567890123' }))
    expect(res.status).toBe(200)
  })
})

describe('PATCH /api/profile — backlog 4.9: birthDate age-range sanity check, only on actual change', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(session as never)
    mocks.findFirst.mockResolvedValue(null)
  })

  it('rejects a birthDate that would make the employee 5 years old when it differs from the stored value', async () => {
    mocks.findUnique.mockResolvedValue(userRow({ birthDate: null }))
    const res = await PATCH(makePatch({ ...validPayload, birthDate: yearsAgo(5) }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('15-80')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects a birthDate that would make the employee 100 years old', async () => {
    mocks.findUnique.mockResolvedValue(userRow({ birthDate: null }))
    const res = await PATCH(makePatch({ ...validPayload, birthDate: yearsAgo(100) }))
    expect(res.status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('accepts a reasonable birthDate (age 30)', async () => {
    mocks.findUnique.mockResolvedValue(userRow({ birthDate: null }))
    mocks.update.mockResolvedValue(userRow({ birthDate: new Date(yearsAgo(30)) }))
    const res = await PATCH(makePatch({ ...validPayload, birthDate: yearsAgo(30) }))
    expect(res.status).toBe(200)
  })

  it('does NOT re-validate age when the employee resubmits their existing (already out-of-range) birthDate unchanged', async () => {
    const outOfRange = new Date(yearsAgo(100))
    mocks.findUnique.mockResolvedValue(userRow({ birthDate: outOfRange }))
    mocks.update.mockResolvedValue(userRow({ birthDate: outOfRange }))
    const res = await PATCH(makePatch({ ...validPayload, birthDate: outOfRange.toISOString().slice(0, 10) }))
    expect(res.status).toBe(200)
  })
})
