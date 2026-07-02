import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  PUBLIC_ROUTES,
  AUTH_ROUTES,
  isPublicPageRoute,
  isAuthPageRoute,
  isStaffOpenRoute,
} from '@/lib/middleware-config'
import { isPublicApiRoute } from '@/lib/api-public-routes'
import { canAccess } from '@/lib/access-control'
import {
  getDeployProfile,
  isPathHiddenByDeployProfile,
  resetDeployProfileCache,
  LEGAL_PATHS,
  FINANCE_PATHS,
  HR_ADMIN_PATHS,
  WORK_MODULE_PATHS,
} from '@/lib/deploy-profile'

describe('middleware gates', () => {
  const env = process.env

  beforeEach(() => resetDeployProfileCache())
  afterEach(() => {
    process.env = env
    resetDeployProfileCache()
  })

  it('public routes include login and client portal', () => {
    expect(PUBLIC_ROUTES).toContain('/login')
    expect(PUBLIC_ROUTES).toContain('/client-portal/login')
    expect(isPublicPageRoute('/login')).toBe(true)
    expect(isPublicPageRoute('/approval-center')).toBe(false)
  })

  it('auth routes redirect logged-in users', () => {
    expect(isAuthPageRoute('/login')).toBe(true)
    expect(isAuthPageRoute('/client-portal/login')).toBe(true)
    expect(AUTH_ROUTES).toContain('/forgot-password')
  })

  it('protected API routes require session unless public', () => {
    expect(isPublicApiRoute('/api/auth/login')).toBe(true)
    expect(isPublicApiRoute('/api/cron/schema-migrate')).toBe(true)
    expect(isPublicApiRoute('/api/client-portal/auth/login')).toBe(true)
    expect(isPublicApiRoute('/api/payslip/pay-abc123/line-pdf')).toBe(true)
    expect(isPublicApiRoute('/api/notifications')).toBe(false)
    expect(isPublicApiRoute('/api/announcements/sse')).toBe(false)
  })

  it('EMPLOYEE cannot access approval-center or payroll', () => {
    expect(canAccess('EMPLOYEE', '/approval-center')).toBe(false)
    expect(canAccess('EMPLOYEE', '/payroll')).toBe(false)
    expect(canAccess('EMPLOYEE', '/attendance')).toBe(true)
  })

  it('EMPLOYEE can access /manual (staff open + ROUTE_PERMISSIONS)', () => {
    expect(isStaffOpenRoute('/manual')).toBe(true)
    expect(canAccess('EMPLOYEE', '/manual')).toBe(true)
    expect(canAccess('LAWYER', '/manual')).toBe(true)
  })

  it('/manual is not hidden by hr or legal deploy profiles', () => {
    process.env.NEXT_PUBLIC_DEPLOY_PROFILE = 'hr'
    resetDeployProfileCache()
    expect(isPathHiddenByDeployProfile('/manual')).toBe(false)
    process.env.NEXT_PUBLIC_DEPLOY_PROFILE = 'legal'
    resetDeployProfileCache()
    expect(isPathHiddenByDeployProfile('/manual')).toBe(false)
    delete process.env.NEXT_PUBLIC_DEPLOY_PROFILE
    resetDeployProfileCache()
  })

  it('hr deploy profile hides legal/finance paths but not payroll', () => {
    process.env.NEXT_PUBLIC_DEPLOY_PROFILE = 'hr'
    resetDeployProfileCache()
    expect(getDeployProfile()).toBe('hr')
    for (const p of LEGAL_PATHS.slice(0, 3)) {
      expect(isPathHiddenByDeployProfile(p)).toBe(true)
    }
    for (const p of FINANCE_PATHS.slice(0, 2)) {
      expect(isPathHiddenByDeployProfile(p)).toBe(true)
    }
    for (const p of WORK_MODULE_PATHS.slice(0, 2)) {
      expect(isPathHiddenByDeployProfile(p)).toBe(true)
    }
    expect(isPathHiddenByDeployProfile('/payroll')).toBe(false)
    expect(isPathHiddenByDeployProfile('/api/cases')).toBe(true)
  })

  it('legal deploy profile hides HR admin paths', () => {
    process.env.NEXT_PUBLIC_DEPLOY_PROFILE = 'legal'
    resetDeployProfileCache()
    for (const p of HR_ADMIN_PATHS.slice(0, 3)) {
      expect(isPathHiddenByDeployProfile(p)).toBe(true)
    }
    expect(isPathHiddenByDeployProfile('/cases')).toBe(false)
  })
})
