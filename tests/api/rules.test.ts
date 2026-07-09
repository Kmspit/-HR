import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    companyRule: { create: vi.fn(), update: vi.fn().mockResolvedValue({ id: 'r1' }) },
  },
}))
vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PATCH } from '@/app/api/rules/route'

const session = { user: { id: 'admin-1', role: 'MANAGER_HR' } }

function makePatch(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/rules', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/rules — field allowlist (no mass-assignment)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(session as never)
  })

  it('updates only the allowed fields sent in the body', async () => {
    const res = await PATCH(makePatch({ id: 'r1', title: 'New title', category: 'hr' }))
    expect(res.status).toBe(200)
    expect(prisma.companyRule.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { title: 'New title', category: 'hr' },
    })
  })

  it('strips createdById, publishedAt, and updatedAt even if the client sends them — cannot forge the audit trail', async () => {
    const res = await PATCH(makePatch({
      id: 'r1',
      title: 'X',
      createdById: 'someone-else',
      publishedAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
      isPublished: false,
    }))
    expect(res.status).toBe(200)
    expect(prisma.companyRule.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { title: 'X' },
    })
  })

  it('requires id', async () => {
    const res = await PATCH(makePatch({ title: 'X' }))
    expect(res.status).toBe(400)
    expect(prisma.companyRule.update).not.toHaveBeenCalled()
  })

  it('forbids a role outside MANAGER_HR/ADMIN', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'emp-1', role: 'EMPLOYEE' } } as never)
    const res = await PATCH(makePatch({ id: 'r1', title: 'X' }))
    expect(res.status).toBe(403)
    expect(prisma.companyRule.update).not.toHaveBeenCalled()
  })
})
