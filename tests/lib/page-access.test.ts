import { describe, expect, it } from 'vitest'
import { canAccessPage } from '@/lib/page-access'

describe('canAccessPage', () => {
  it('allows HR on settings (matches middleware HR_ADMIN)', () => {
    expect(canAccessPage('HR', '/settings')).toBe(true)
  })

  it('allows MANAGER on employees (EMPLOYEE_MGMT)', () => {
    expect(canAccessPage('MANAGER', '/employees')).toBe(true)
  })

  it('now allows MANAGER on /executive too — coarse Edge gate only (2026-10-02)', () => {
    // /executive's ROUTE_PERMISSIONS entry was deliberately widened to
    // ALL_ROLES so middleware lets every staff role through to the
    // Node-runtime canAccessPageForUser() check (lib/page-access-server.ts,
    // see override-eligible-paths.ts). canAccessPage() alone no longer
    // reflects the real "default access" answer for /executive/payroll/
    // reports — use canAccessPageForUser() for those 3 paths. This test
    // documents the widening so it's never mistaken for a regression.
    expect(canAccessPage('MANAGER', '/executive')).toBe(true)
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

  it('regression guard: every non-override-eligible path keeps its exact original role list (not widened)', () => {
    // /payroll, /reports, /executive are the ONLY 3 paths deliberately
    // widened for the per-user override feature. Every other path must be
    // completely unaffected — spot-check a representative sample that would
    // ALL now pass if ROUTE_PERMISSIONS had been accidentally widened too
    // broadly instead of just those 3 keys.
    expect(canAccessPage('EMPLOYEE', '/settings')).toBe(false)
    expect(canAccessPage('EMPLOYEE', '/branches')).toBe(false)
    expect(canAccessPage('EMPLOYEE', '/employees')).toBe(false)
    expect(canAccessPage('MANAGER', '/payroll/deleted')).toBe(false)
    expect(canAccessPage('CLIENT', '/dashboard')).toBe(false)
  })
})
