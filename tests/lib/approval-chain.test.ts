import { describe, it, expect } from 'vitest'
import { canUserActOnStep } from '@/lib/approval-chain'

describe('canUserActOnStep', () => {
  const base = {
    id: 's1',
    stepOrder: 1,
    stepName: 'หัวหน้า',
    canSkip: false,
  }

  it('allows matching approverId', () => {
    expect(canUserActOnStep(
      { ...base, approverId: 'u1', approverRole: null },
      'u1',
      'TEAM_LEADER',
    )).toBe(true)
  })

  it('allows matching approverRole', () => {
    expect(canUserActOnStep(
      { ...base, approverId: null, approverRole: 'HR' },
      'other',
      'HR',
    )).toBe(true)
  })

  it('denies when no approver configured', () => {
    expect(canUserActOnStep(
      { ...base, approverId: null, approverRole: null },
      'anyone',
      'EMPLOYEE',
    )).toBe(false)
  })

  it('denies wrong user for approverId step', () => {
    expect(canUserActOnStep(
      { ...base, approverId: 'u1', approverRole: null },
      'u2',
      'TEAM_LEADER',
    )).toBe(false)
  })
})
