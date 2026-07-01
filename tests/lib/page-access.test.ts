import { describe, expect, it } from 'vitest'
import { canAccessPage } from '@/lib/page-access'

describe('canAccessPage', () => {
  it('allows HR on settings (matches middleware HR_ADMIN)', () => {
    expect(canAccessPage('HR', '/settings')).toBe(true)
  })

  it('allows MANAGER on employees (EMPLOYEE_MGMT)', () => {
    expect(canAccessPage('MANAGER', '/employees')).toBe(true)
  })

  it('blocks MANAGER on executive (EXEC_ONLY)', () => {
    expect(canAccessPage('MANAGER', '/executive')).toBe(false)
  })

  it('allows LAWYER on weekly-plan', () => {
    expect(canAccessPage('LAWYER', '/weekly-plan')).toBe(true)
  })
})
