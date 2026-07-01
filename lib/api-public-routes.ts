/** API paths that do not require a staff NextAuth session (each has its own auth). */
export const API_PUBLIC_PREFIXES = [
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/register',
  '/api/register',
  '/api/line/webhook',
  '/api/webhook',
  '/api/cron',
  '/api/branches/public',
  '/api/auth/callback',
  '/api/auth/session',
  '/api/auth/csrf',
  '/api/auth/providers',
  '/api/auth/signin',
  '/api/auth/signout',
  '/api/client-portal/auth/login',
  '/api/system/health',
] as const

export function isPublicApiRoute(pathname: string): boolean {
  // Portal data routes use cp_token — not staff NextAuth (admin sub-routes still require staff session)
  if (
    pathname.startsWith('/api/client-portal/') &&
    !pathname.startsWith('/api/client-portal/admin')
  ) {
    return true
  }
  return API_PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}
