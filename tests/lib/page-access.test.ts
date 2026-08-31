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

  it('allows SUPER_ADMIN and CEO on payroll/deleted (PAYROLL_DELETE_ROLES)', () => {
    expect(canAccessPage('SUPER_ADMIN', '/payroll/deleted')).toBe(true)
    expect(canAccessPage('CEO', '/payroll/deleted')).toBe(true)
  })

  it('blocks HR and MANAGER_HR on payroll/deleted — legally-retained docs are an executive decision', () => {
    expect(canAccessPage('HR', '/payroll/deleted')).toBe(false)
    expect(canAccessPage('MANAGER_HR', '/payroll/deleted')).toBe(false)
  })

  it('still allows HR_CORE roles on the regular payroll page — only the deleted view is narrower', () => {
    expect(canAccessPage('HR', '/payroll')).toBe(true)
    expect(canAccessPage('MANAGER_HR', '/payroll')).toBe(true)
  })
})
