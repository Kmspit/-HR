import { describe, expect, it } from 'vitest'
import { canAccessApprovalCenter, canActOnDomain } from '@/lib/approval-center/access'

describe('approval-center access', () => {
  it('allows MANAGER with approve_leave into approval center', () => {
    expect(canAccessApprovalCenter('MANAGER')).toBe(true)
    expect(canActOnDomain('MANAGER', 'LEAVE')).toBe(true)
  })

  it('blocks EMPLOYEE from approval center', () => {
    expect(canAccessApprovalCenter('EMPLOYEE')).toBe(false)
  })

  it('CEO can act on weekly plan', () => {
    expect(canActOnDomain('CEO', 'WEEKLY_PLAN')).toBe(true)
  })
})
