import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    companyBranch: { findFirst: vi.fn() },
    leaveBalance: { create: vi.fn().mockResolvedValue({}) },
  },
}))

vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }))
vi.mock('@/lib/utils', () => ({ generateEmployeeId: vi.fn().mockReturnValue('EMP001') }))
vi.mock('@/lib/notifications', () => ({
  notifyRole: vi.fn().mockResolvedValue(undefined),
  sendLineNotify: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 4, resetAt: Date.now() }),
}))

const assertLineFieldsUnique = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/line-profile', async () => {
  const actual = await vi.importActual<typeof import('@/lib/line-profile')>('@/lib/line-profile')
  return {
    ...actual,
    assertLineFieldsUnique: (...a: unknown[]) => assertLineFieldsUnique(...a),
  }
})

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/register/route'

const validBody = {
  name: 'Somchai Test', firstName: 'Somchai', lastName: 'Test',
  email: 'somchai@x.com', phone: '0812345678',
  role: 'EMPLOYEE', startDate: '2026-01-01',
  password: 'Password1', branchId: 'branch-1', lineId: '@somchai',
}

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/register — duplicate-field errors are generic (public, unauthenticated endpoint)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertLineFieldsUnique.mockResolvedValue({ ok: true })
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.companyBranch.findFirst).mockResolvedValue({ id: 'branch-1', name: 'HQ' } as never)
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 'u1' } as never)
  })

  it('duplicate email: generic message, not "อีเมลนี้มีการลงทะเบียนแล้ว"', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'existing' } as never)
    const res = await POST(makeReq(validBody))
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toBe('ข้อมูลนี้มีอยู่ในระบบแล้ว')
  })

  it('duplicate phone: same generic message as duplicate email', async () => {
    vi.mocked(prisma.user.findFirst).mockImplementation(((args: { where: Record<string, unknown> }) =>
      Promise.resolve(args.where && 'phone' in args.where ? { id: 'existing' } : null)) as never)
    const res = await POST(makeReq(validBody))
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toBe('ข้อมูลนี้มีอยู่ในระบบแล้ว')
  })

  it('duplicate nationalId: same generic message', async () => {
    vi.mocked(prisma.user.findFirst).mockImplementation(((args: { where: Record<string, unknown> }) =>
      Promise.resolve(args.where && 'nationalId' in args.where ? { id: 'existing' } : null)) as never)
    const res = await POST(makeReq({ ...validBody, nationalId: '1234567890123' }))
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toBe('ข้อมูลนี้มีอยู่ในระบบแล้ว')
  })

  it('duplicate LINE ID: same generic message, not assertLineFieldsUnique\'s own wording', async () => {
    assertLineFieldsUnique.mockResolvedValue({ ok: false, error: 'LINE ID นี้มีในระบบแล้ว' })
    const res = await POST(makeReq(validBody))
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toBe('ข้อมูลนี้มีอยู่ในระบบแล้ว')
  })

  it('succeeds when nothing is duplicated', async () => {
    const res = await POST(makeReq(validBody))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
  })
})
