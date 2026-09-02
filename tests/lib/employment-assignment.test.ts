import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    employmentAssignment: {
      findFirst: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getAssignmentAsOf, getCurrentAssignment, mapEmploymentTypeToLegacy } from '@/lib/employment-assignment'

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

describe('getCurrentAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the assignment when the most recent one is not a TERMINATION', async () => {
    vi.mocked(prisma.employmentAssignment.findFirst).mockResolvedValue({ id: 'ea-1', changeType: 'PROMOTION' } as never)

    const result = await getCurrentAssignment('user-1')

    expect(result).toEqual({ id: 'ea-1', changeType: 'PROMOTION' })
  })

  it('returns null (not the row) when the most recent assignment is a TERMINATION — the exact bug this guards against', async () => {
    vi.mocked(prisma.employmentAssignment.findFirst).mockResolvedValue({ id: 'ea-2', changeType: 'TERMINATION' } as never)

    const result = await getCurrentAssignment('departed-user')

    expect(result).toBeNull()
  })

  it('returns null when there is no assignment at all', async () => {
    vi.mocked(prisma.employmentAssignment.findFirst).mockResolvedValue(null)

    const result = await getCurrentAssignment('never-hired-user')

    expect(result).toBeNull()
  })
})

describe('mapEmploymentTypeToLegacy', () => {
  it('maps FULL_TIME and INTERN onto their exact pre-existing semantic match', () => {
    expect(mapEmploymentTypeToLegacy('FULL_TIME')).toBe('permanent_employee')
    expect(mapEmploymentTypeToLegacy('INTERN')).toBe('intern')
  })

  it('maps CONTRACT/PART_TIME/DAILY onto the 3 new additive legacy values', () => {
    expect(mapEmploymentTypeToLegacy('CONTRACT')).toBe('contract_employee')
    expect(mapEmploymentTypeToLegacy('PART_TIME')).toBe('part_time_employee')
    expect(mapEmploymentTypeToLegacy('DAILY')).toBe('daily_employee')
  })

  it('never maps anything onto probation_employee — that value is legacy-display-only', () => {
    const types: Array<Parameters<typeof mapEmploymentTypeToLegacy>[0]> = ['FULL_TIME', 'CONTRACT', 'PART_TIME', 'DAILY', 'INTERN']
    for (const t of types) {
      expect(mapEmploymentTypeToLegacy(t)).not.toBe('probation_employee')
    }
  })
})
