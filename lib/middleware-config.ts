/** Shared middleware route lists — import in middleware.ts and tests. */

export const PUBLIC_ROUTES = ['/', '/login', '/register', '/forgot-password', '/client-portal/login', '/install'] as const

export const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/client-portal/login'] as const

/** Logged-in staff routes — no RBAC / deploy-profile gate (help, profile, etc.) */
export const STAFF_OPEN_ROUTES = [
  '/manual',
  '/notifications',
  '/profile',
  '/org-pending',
  '/unauthorized',
] as const

/** API routes always allowed (auth, webhooks, cron) — not module-scoped */
export const API_DEPLOY_PROFILE_EXEMPT = [
  '/api/auth',
  '/api/line/webhook',
  '/api/webhook',
  '/api/cron',
  '/api/register',
] as const

export function isPublicPageRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => pathname === r)
}

export function isAuthPageRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((r) => pathname.startsWith(r))
}

/** Any active internal staff may access (after session check). */
export function isStaffOpenRoute(pathname: string): boolean {
  return STAFF_OPEN_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  )
}

export function isApiDeployProfileExempt(pathname: string): boolean {
  return API_DEPLOY_PROFILE_EXEMPT.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}
