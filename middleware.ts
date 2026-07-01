import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ROUTE_PERMISSIONS, ROLE_DEFAULT_ROUTE } from '@/lib/permissions'
import { logAccessDenied } from '@/lib/access-log'
import { isPathHiddenByDeployProfile } from '@/lib/deploy-profile'
import { isPublicApiRoute } from '@/lib/api-public-routes'
import type { Role } from '@prisma/client'
const { auth } = NextAuth(authConfig)

// Public routes — no auth needed
const PUBLIC_ROUTES = ['/', '/login', '/register', '/forgot-password', '/client-portal/login']
const AUTH_ROUTES   = ['/login', '/register', '/forgot-password', '/client-portal/login']

/** API routes always allowed (auth, webhooks, cron) — not module-scoped */
const API_DEPLOY_PROFILE_EXEMPT = [
  '/api/auth',
  '/api/line/webhook',
  '/api/webhook',
  '/api/cron',
  '/api/register',
]

function isApiDeployProfileExempt(pathname: string): boolean {
  return API_DEPLOY_PROFILE_EXEMPT.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

export default auth(async function middleware(req: NextRequest & { auth: { user?: { role: Role; status: string } } | null }) {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // API — deploy profile gate + session required unless public
  if (pathname.startsWith('/api/')) {
    if (!isApiDeployProfileExempt(pathname) && isPathHiddenByDeployProfile(pathname)) {
      logAccessDenied('deploy_profile_denied', {
        path: pathname,
        role: session?.user?.role,
        api: true,
      })
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (!isPublicApiRoute(pathname) && !session?.user) {
      logAccessDenied('missing_session', { path: pathname, api: true })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session?.user && session.user.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Account inactive' }, { status: 403 })
    }
    return NextResponse.next()
  }
  const isPublic = PUBLIC_ROUTES.some((r) => pathname === r)
  const isAuth   = AUTH_ROUTES.some((r) => pathname.startsWith(r))

  // Not logged in → ไปหน้า login (PC ที่เคยล็อกอินแล้วหลุด session)
  if (!session?.user) {
    if (isPublic) return NextResponse.next()
    logAccessDenied('missing_session', { path: pathname })
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    if (pathname !== '/login') {
      url.searchParams.set('callbackUrl', pathname)
    }
    return NextResponse.redirect(url)
  }

  const { role, status } = session.user

  // Pending / disabled accounts
  if (status !== 'ACTIVE') {
    if (pathname === '/') return NextResponse.next()
    logAccessDenied('inactive_account', { path: pathname, role, status })
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('status', status.toLowerCase())
    return NextResponse.redirect(url)
  }

  // CLIENT role: can only access /client-portal/** — redirect everything else
  if (role === 'CLIENT') {
    if (pathname.startsWith('/client-portal') || pathname === '/unauthorized') {
      return NextResponse.next()
    }
    const url = req.nextUrl.clone()
    url.pathname = '/client-portal'
    return NextResponse.redirect(url)
  }

  // Logged-in user tries to visit auth pages → redirect to their dashboard
  if (isAuth) {
    const url = req.nextUrl.clone()
    url.pathname = ROLE_DEFAULT_ROUTE[role]
    return NextResponse.redirect(url)
  }

  // Root → redirect to role dashboard
  if (pathname === '/') {
    const url = req.nextUrl.clone()
    url.pathname = ROLE_DEFAULT_ROUTE[role]
    return NextResponse.redirect(url)
  }

  // Check route permission
  const matchedRoute = Object.keys(ROUTE_PERMISSIONS).find((r) => pathname.startsWith(r))
  if (matchedRoute) {
    const allowed = ROUTE_PERMISSIONS[matchedRoute]
    if (!allowed.includes(role)) {
      logAccessDenied('role_denied', { path: pathname, role, matchedRoute, allowed })
      const url = req.nextUrl.clone()
      url.pathname = '/unauthorized'
      return NextResponse.redirect(url)
    }
  }

  // Deploy profile / frozen modules (Phase 4 / Phase 2)
  if (isPathHiddenByDeployProfile(pathname)) {
    logAccessDenied('deploy_profile_denied', { path: pathname, role })
    const url = req.nextUrl.clone()
    url.pathname = '/unauthorized'
    return NextResponse.redirect(url)
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-pathname', pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
