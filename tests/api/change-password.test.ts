import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/security-events', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) =>
    new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue('$2a$12$newhash'),
  },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSecurityEvent } from '@/lib/security-events'
import bcrypt from 'bcryptjs'
import { POST } from '@/app/api/profile/change-password/route'

const mockSession = { user: { id: 'user-1', email: 'user@test.com', role: 'EMPLOYEE' } }

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/profile/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  currentPassword: 'OldPass1!',
  newPassword: 'NewPass2!',
  confirmPassword: 'NewPass2!',
}

describe('POST /api/profile/change-password', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 400 when current password is wrong', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      passwordHash: '$2a$12$old',
    } as never)
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)

    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('รหัสผ่านปัจจุบันไม่ถูกต้อง')
    expect(data.field).toBe('currentPassword')
  })

  it('returns 400 when new passwords do not match', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    const res = await POST(
      makeReq({ ...validBody, confirmPassword: 'OtherPass2!' }),
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('ไม่ตรงกัน')
    expect(data.field).toBe('confirmPassword')
  })

  it('returns 400 when new password contains Thai characters', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    const res = await POST(
      makeReq({
        currentPassword: 'OldPass1!',
        newPassword: 'รหัสใหม่1',
        confirmPassword: 'รหัสใหม่1',
      }),
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('กรุณากรอกเป็นภาษาอังกฤษเท่านั้น')
    expect(data.field).toBe('newPassword')
  })

  it('changes password successfully', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      passwordHash: '$2a$12$old',
    } as never)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
    vi.mocked(prisma.user.update).mockResolvedValue({ id: 'user-1' } as never)

    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.message).toContain('สำเร็จ')

    expect(bcrypt.hash).toHaveBeenCalledWith('NewPass2!', 12)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ passwordHash: '$2a$12$newhash' }),
      }),
    )
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'PASSWORD_CHANGED',
      }),
    )
  })
})
