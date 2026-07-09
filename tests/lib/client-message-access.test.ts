import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    taskAssignment: { findFirst: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { resolveClientUserIdForPortal } from '@/lib/client-message-access'

describe('resolveClientUserIdForPortal — cross-tenant email-collision guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the legacy user id when it is actually linked to the caller\'s own company', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'legacy-1' } as never)
    vi.mocked(prisma.taskAssignment.findFirst).mockResolvedValueOnce({ id: 'ta-1' } as never) // linked-to-company check

    const result = await resolveClientUserIdForPortal('shared@firm.com', 'company-A')

    expect(result).toBe('legacy-1')
    expect(prisma.taskAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: 'legacy-1', clientCompanyId: 'company-A' } }),
    )
  })

  it('does NOT return a legacy user matched by email alone when they belong to a different company', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'legacy-from-company-B' } as never)
    // No TaskAssignment links this legacy user to company-A.
    vi.mocked(prisma.taskAssignment.findFirst)
      .mockResolvedValueOnce(null as never) // linked-to-company check fails
      .mockResolvedValueOnce(null as never) // fallback lookup also finds nothing

    const result = await resolveClientUserIdForPortal('shared@firm.com', 'company-A')

    expect(result).toBeNull()
  })

  it('falls back to the taskAssignment-derived clientId when no email match exists at all', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.taskAssignment.findFirst).mockResolvedValueOnce({ clientId: 'fallback-client-1' } as never)

    const result = await resolveClientUserIdForPortal('nobody@x.com', 'company-A')

    expect(result).toBe('fallback-client-1')
  })

  it('falls back to the taskAssignment-derived clientId when the email match exists but is cross-tenant', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'legacy-from-company-B' } as never)
    vi.mocked(prisma.taskAssignment.findFirst)
      .mockResolvedValueOnce(null as never) // linked-to-company check fails (wrong company)
      .mockResolvedValueOnce({ clientId: 'real-company-A-client' } as never) // fallback succeeds

    const result = await resolveClientUserIdForPortal('shared@firm.com', 'company-A')

    expect(result).toBe('real-company-A-client')
  })
})
