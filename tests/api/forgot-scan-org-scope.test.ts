import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    forgotScanRequest: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/forgot-scan/route'

const mgrSession = { user: { id: 'mgr-1', role: 'MANAGER', branchId: 'b1' } }
const hrSession = { user: { id: 'hr-1', role: 'HR', branchId: 'b1' } }

function makeGet(tab = 'pending') {
  return new NextRequest(`http://localhost/api/forgot-scan?tab=${tab}`)
}

describe('GET /api/forgot-scan org-scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.forgotScanRequest.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'rep-1' }] as never)
  })

  it('scopes pending tab to direct reports for MANAGER', async () => {
    vi.mocked(auth).mockResolvedValue(mgrSession as never)

    const res = await GET(makeGet('pending'))
    expect(res.status).toBe(200)

    expect(prisma.forgotScanRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING',
          userId: { in: ['mgr-1', 'rep-1'] },
        }),
      }),
    )
  })

  it('does not org-scope pending tab for HR roles', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)

    const res = await GET(makeGet('pending'))
    expect(res.status).toBe(200)

    expect(prisma.forgotScanRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['PENDING', 'ADMIN_APPROVED'] } },
      }),
    )
  })

  it('mine tab always filters to own userId', async () => {
    vi.mocked(auth).mockResolvedValue(mgrSession as never)

    await GET(makeGet('mine'))

    expect(prisma.forgotScanRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'mgr-1' },
      }),
    )
  })
})
