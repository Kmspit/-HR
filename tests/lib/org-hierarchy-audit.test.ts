import { describe, it, expect, vi } from 'vitest'
import { getInactiveAssigneeGaps } from '@/lib/org-hierarchy-audit'

function mockPrisma(overrides: {
  cases?: unknown[]
  tasks?: unknown[]
  latestAssignments?: unknown[]
}) {
  return {
    case: { findMany: vi.fn().mockResolvedValue(overrides.cases ?? []) },
    taskAssignment: { findMany: vi.fn().mockResolvedValue(overrides.tasks ?? []) },
    employmentAssignment: { findMany: vi.fn().mockResolvedValue(overrides.latestAssignments ?? []) },
  } as any
}

describe('getInactiveAssigneeGaps', () => {
  it('flags an inactive employee with an open case still assigned', async () => {
    const prisma = mockPrisma({
      cases: [
        {
          id: 'case-1', caseNumber: 'CASE-001', caseTitle: 'ทวงหนี้ A', status: 'INVESTIGATING',
          assignedEmployee: { id: 'law-1', name: 'ทนาย ก', status: 'DISABLED' },
        },
      ],
    })

    const { gaps, gapCount } = await getInactiveAssigneeGaps(prisma)

    expect(gapCount).toBe(1)
    expect(gaps).toEqual([
      {
        employeeId: 'law-1',
        employeeName: 'ทนาย ก',
        employeeStatus: 'DISABLED',
        isTerminated: false, // DISABLED but no TERMINATION assignment on record — merely suspended
        cases: [{ id: 'case-1', caseNumber: 'CASE-001', caseTitle: 'ทวงหนี้ A', status: 'INVESTIGATING' }],
        tasks: [],
      },
    ])
  })

  it('flags an inactive employee with an open task still assigned', async () => {
    const prisma = mockPrisma({
      tasks: [
        {
          id: 'task-1', title: 'ยื่นฟ้อง', status: 'IN_PROGRESS',
          assignee: { id: 'law-2', name: 'ทนาย ข', status: 'REJECTED' },
        },
      ],
    })

    const { gaps, gapCount } = await getInactiveAssigneeGaps(prisma)

    expect(gapCount).toBe(1)
    expect(gaps[0].tasks).toEqual([{ id: 'task-1', title: 'ยื่นฟ้อง', status: 'IN_PROGRESS' }])
    expect(gaps[0].cases).toEqual([])
  })

  it('merges a case and a task under the same employee into one gap entry', async () => {
    const prisma = mockPrisma({
      cases: [
        {
          id: 'case-1', caseNumber: 'CASE-001', caseTitle: 'ทวงหนี้ A', status: 'FILED',
          assignedEmployee: { id: 'law-1', name: 'ทนาย ก', status: 'DISABLED' },
        },
      ],
      tasks: [
        {
          id: 'task-1', title: 'ยื่นฟ้อง', status: 'PENDING',
          assignee: { id: 'law-1', name: 'ทนาย ก', status: 'DISABLED' },
        },
      ],
    })

    const { gaps, gapCount } = await getInactiveAssigneeGaps(prisma)

    expect(gapCount).toBe(1) // one employee, not two separate gap rows
    expect(gaps[0].cases).toHaveLength(1)
    expect(gaps[0].tasks).toHaveLength(1)
  })

  it('the underlying queries already scope to open cases and non-terminal tasks assigned to a non-ACTIVE employee', async () => {
    const prisma = mockPrisma({})
    await getInactiveAssigneeGaps(prisma)

    expect(prisma.case.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          closedAt: null,
          assignedEmployeeId: { not: null },
          assignedEmployee: { status: { not: 'ACTIVE' } },
        }),
      }),
    )
    expect(prisma.taskAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
          assignee: { status: { not: 'ACTIVE' } },
        }),
      }),
    )
  })

  it('returns no gaps when there are none', async () => {
    const prisma = mockPrisma({})
    const { gaps, gapCount } = await getInactiveAssigneeGaps(prisma)
    expect(gaps).toEqual([])
    expect(gapCount).toBe(0)
  })

  describe('พ้นสภาพ (terminated) vs ระงับ (suspended) split', () => {
    it('marks isTerminated true when the DISABLED employee\'s latest assignment is a TERMINATION', async () => {
      const prisma = mockPrisma({
        cases: [{
          id: 'case-1', caseNumber: 'CASE-001', caseTitle: 'ทวงหนี้ A', status: 'FILED',
          assignedEmployee: { id: 'law-1', name: 'ทนาย ก', status: 'DISABLED' },
        }],
        latestAssignments: [{ userId: 'law-1', changeType: 'TERMINATION' }],
      })

      const { gaps } = await getInactiveAssigneeGaps(prisma)

      expect(gaps[0].isTerminated).toBe(true)
      expect(prisma.employmentAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: { in: ['law-1'] } } }),
      )
    })

    it('marks isTerminated false when the DISABLED employee has no TERMINATION assignment (administratively suspended)', async () => {
      const prisma = mockPrisma({
        cases: [{
          id: 'case-1', caseNumber: 'CASE-001', caseTitle: 'ทวงหนี้ A', status: 'FILED',
          assignedEmployee: { id: 'law-1', name: 'ทนาย ก', status: 'DISABLED' },
        }],
        latestAssignments: [{ userId: 'law-1', changeType: 'PROMOTION' }],
      })

      const { gaps } = await getInactiveAssigneeGaps(prisma)

      expect(gaps[0].isTerminated).toBe(false)
    })

    it('leaves isTerminated undefined for non-DISABLED statuses and never queries employmentAssignment for them', async () => {
      const prisma = mockPrisma({
        tasks: [{
          id: 'task-1', title: 'ยื่นฟ้อง', status: 'PENDING',
          assignee: { id: 'law-2', name: 'ทนาย ข', status: 'REJECTED' },
        }],
      })

      const { gaps } = await getInactiveAssigneeGaps(prisma)

      expect(gaps[0].isTerminated).toBeUndefined()
      expect(prisma.employmentAssignment.findMany).not.toHaveBeenCalled()
    })

    it('only queries employmentAssignment for the DISABLED subset when statuses are mixed', async () => {
      const prisma = mockPrisma({
        cases: [{
          id: 'case-1', caseNumber: 'CASE-001', caseTitle: 'ทวงหนี้ A', status: 'FILED',
          assignedEmployee: { id: 'law-1', name: 'ทนาย ก', status: 'DISABLED' },
        }],
        tasks: [{
          id: 'task-1', title: 'ยื่นฟ้อง', status: 'PENDING',
          assignee: { id: 'law-2', name: 'ทนาย ข', status: 'REJECTED' },
        }],
        latestAssignments: [{ userId: 'law-1', changeType: 'TERMINATION' }],
      })

      const { gaps } = await getInactiveAssigneeGaps(prisma)

      expect(prisma.employmentAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: { in: ['law-1'] } } }),
      )
      const byId = Object.fromEntries(gaps.map((g) => [g.employeeId, g]))
      expect(byId['law-1'].isTerminated).toBe(true)
      expect(byId['law-2'].isTerminated).toBeUndefined()
    })
  })
})
