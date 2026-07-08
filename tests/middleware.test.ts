import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
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
import { csrfGateForApiRoute, isCsrfExemptApiRoute, isMutatingMethod } from '@/lib/csrf'

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
    expect(isPublicApiRoute('/api/attendance/scan-image/scan-abc123')).toBe(true)
    expect(isPublicApiRoute('/api/warnings/warn-abc123/pdf')).toBe(true)
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

// ── Global CSRF gate (Phase B — moved from per-route requireCsrf() calls) ────

describe('csrfGateForApiRoute — global default-deny CSRF gate', () => {
  function req(method: string, pathname: string, origin: string | null, host = 'app.example.com') {
    const headers: Record<string, string> = { host }
    if (origin) headers.origin = origin
    return new NextRequest(`http://${host}${pathname}`, { method, headers })
  }

  it('is not applied to read-only methods regardless of origin', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const r = req(method, '/api/anything', 'https://evil.example.com')
      expect(csrfGateForApiRoute(r, '/api/anything')).toBeNull()
    }
  })

  it('blocks a cross-origin mutating request to a brand-new route that never had its own CSRF check', () => {
    // Simulates a hypothetical future endpoint (e.g. /api/some-new-feature/route.ts)
    // that a developer forgets to add requireCsrf() to — the global gate must
    // still catch it since protection no longer depends on each file opting in.
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const r = req(method, '/api/some-new-feature-nobody-added-csrf-to', 'https://evil.example.com')
      const blocked = csrfGateForApiRoute(r, '/api/some-new-feature-nobody-added-csrf-to')
      expect(blocked).not.toBeNull()
      expect(blocked?.status).toBe(403)
    }
  })

  it('allows a same-origin mutating request to that same hypothetical new route', () => {
    const r = req('POST', '/api/some-new-feature-nobody-added-csrf-to', 'http://app.example.com')
    expect(csrfGateForApiRoute(r, '/api/some-new-feature-nobody-added-csrf-to')).toBeNull()
  })

  it('allows a request with no Origin header at all (server-to-server / same-origin fetch)', () => {
    const r = req('POST', '/api/some-new-feature-nobody-added-csrf-to', null)
    expect(csrfGateForApiRoute(r, '/api/some-new-feature-nobody-added-csrf-to')).toBeNull()
  })

  const WHITELIST = [
    '/api/line/webhook',
    '/api/cron/sync-deploy-env',
    '/api/cron/invoice-reminders',
    '/api/cron/contract-reminders',
    '/api/leave/prototype',
    '/api/line/prototype-notify',
  ]

  it.each(WHITELIST)('does not block %s even with a cross-origin POST (own shared-secret/signature auth)', (path) => {
    const r = req('POST', path, 'https://evil.example.com')
    expect(csrfGateForApiRoute(r, path)).toBeNull()
  })

  it('the whitelist is exactly the 6 verified non-cookie endpoints — nothing more, nothing less', () => {
    for (const path of WHITELIST) {
      expect(isCsrfExemptApiRoute(path)).toBe(true)
    }
    // A path that merely starts with an exempt prefix must NOT be treated as exempt.
    expect(isCsrfExemptApiRoute('/api/line/webhook/extra')).toBe(false)
    expect(isCsrfExemptApiRoute('/api/cron/sync-deploy-env-typo')).toBe(false)
    // Spot-check a few ordinary mutating routes are correctly NOT exempt.
    expect(isCsrfExemptApiRoute('/api/cases')).toBe(false)
    expect(isCsrfExemptApiRoute('/api/debtors/abc/payments')).toBe(false)
  })

  it('isMutatingMethod recognizes POST/PATCH/PUT/DELETE only', () => {
    expect(isMutatingMethod('POST')).toBe(true)
    expect(isMutatingMethod('PATCH')).toBe(true)
    expect(isMutatingMethod('PUT')).toBe(true)
    expect(isMutatingMethod('DELETE')).toBe(true)
    expect(isMutatingMethod('get')).toBe(false)
    expect(isMutatingMethod('HEAD')).toBe(false)
    expect(isMutatingMethod('OPTIONS')).toBe(false)
  })

  it('still rejects a malformed Origin header on a non-exempt route (existing validateCsrfOrigin behaviour)', () => {
    const r = req('POST', '/api/cases', 'not-a-valid-url')
    const blocked = csrfGateForApiRoute(r, '/api/cases')
    expect(blocked?.status).toBe(403)
  })
})
