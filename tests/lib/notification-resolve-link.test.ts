import { describe, it, expect } from 'vitest'
import { resolveLink } from '@/lib/notification-center/constants'

describe('resolveLink', () => {
  it('fixes legacy WEEKLY_PLAN link pointing to /leave', () => {
    expect(resolveLink('WEEKLY_PLAN_DUE', '/leave')).toBe('/weekly-plan')
    expect(resolveLink('WEEKLY_PLAN_APPROVED', '/leave')).toBe('/weekly-plan')
  })

  it('fixes legacy FORGOT_SCAN links', () => {
    expect(resolveLink('FORGOT_SCAN_REQUEST', '/approvals')).toBe('/approval-center')
    expect(resolveLink('FORGOT_SCAN_REJECTED', '/leave')).toBe('/forgot-scan')
  })

  it('uses stored link when valid', () => {
    expect(resolveLink('FORGOT_SCAN_REQUEST', '/approval-center')).toBe('/approval-center')
    expect(resolveLink('LEAVE_REQUEST', '/leave/abc')).toBe('/leave/abc')
  })
})
