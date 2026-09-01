import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    employmentAssignment: {
      findFirst: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getAssignmentAsOf } from '@/lib/employment-assignment'

describe('getAssignmentAsOf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries by userId with effectiveFrom <= date, ordered most-recent first', async () => {
    vi.mocked(prisma.employmentAssignment.findFirst).mockResolvedValue({ id: 'ea-1' } as never)

    const date = new Date('2026-06-01')
    const result = await getAssignmentAsOf('user-1', date)

    expect(prisma.employmentAssignment.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', effectiveFrom: { lte: date } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    })
    expect(result).toEqual({ id: 'ea-1' })
  })

  it('returns null when the user has no assignment on or before that date', async () => {
    vi.mocked(prisma.employmentAssignment.findFirst).mockResolvedValue(null)

    const result = await getAssignmentAsOf('user-with-no-history', new Date('2020-01-01'))

    expect(result).toBeNull()
  })

  it('relies on the DB ordering to pick the most recent effectiveFrom <= date (not a future one)', async () => {
    // The mock can't actually filter/sort — this test documents the contract:
    // the query itself (not app code) is responsible for excluding any row
    // whose effectiveFrom is after `date`, and for breaking ties by createdAt.
    vi.mocked(prisma.employmentAssignment.findFirst).mockResolvedValue({
      id: 'ea-2',
      effectiveFrom: new Date('2026-03-01'),
    } as never)

    const result = await getAssignmentAsOf('user-2', new Date('2026-06-01'))

    expect(prisma.employmentAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-2', effectiveFrom: { lte: new Date('2026-06-01') } } }),
    )
    expect(result).toMatchObject({ id: 'ea-2' })
  })
})
