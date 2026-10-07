import { describe, it, expect } from 'vitest'
import { shouldRedirectToLoginOn401 } from '@/lib/client-api'

describe('shouldRedirectToLoginOn401', () => {
  it('staff API 401 on a dashboard page → go to login', () => {
    expect(shouldRedirectToLoginOn401('/api/users', '/employees')).toBe(true)
    expect(shouldRedirectToLoginOn401(new URL('https://app.test/api/leave?x=1'), '/leave')).toBe(true)
  })

  it.each([
    '/api/auth/login',                 // wrong password
    '/api/auth/forgot-password/reset', // wrong OTP
    '/api/security/2fa/verify',        // wrong OTP
    '/api/client-portal/cases',        // portal has its own session
  ])('%s 401 is not a staff-session expiry → no redirect', (url) => {
    expect(shouldRedirectToLoginOn401(url, '/dashboard')).toBe(false)
  })

  it('already on the login page / client portal → no redirect', () => {
    expect(shouldRedirectToLoginOn401('/api/users', '/login')).toBe(false)
    expect(shouldRedirectToLoginOn401('/api/users', '/client-portal/dashboard')).toBe(false)
  })

  it('non-API URLs are ignored', () => {
    expect(shouldRedirectToLoginOn401('https://example.com/x', '/dashboard')).toBe(false)
  })
})
