import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { jobPosition: { findMany: vi.fn() } },
}))
vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/job-positions/route'

describe('GET /api/job-positions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an unauthenticated request', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('rejects a role without canApproveAccounts (e.g. plain EMPLOYEE)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'EMPLOYEE' } } as never)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns only active positions, sorted by sortOrder then name, for an HR session', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'hr-1', role: 'HR' } } as never)
    vi.mocked(prisma.jobPosition.findMany).mockResolvedValue([
      { id: 'p1', name: 'HR Manager', code: null },
    ] as never)

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.positions).toEqual([{ id: 'p1', name: 'HR Manager', code: null }])
    expect(prisma.jobPosition.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  })

  it('allows any canApproveAccounts role — position list is not salary-sensitive, gated at the modal\'s own access level rather than HR_ADMIN specifically', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } } as never)
    vi.mocked(prisma.jobPosition.findMany).mockResolvedValue([] as never)

    const res = await GET()
    expect(res.status).toBe(200)
  })
})
