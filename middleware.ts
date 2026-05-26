import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ROUTE_PERMISSIONS, ROLE_DEFAULT_ROUTE } from '@/lib/permissions'
import type { Role } from '@prisma/client'

const { auth } = NextAuth(authConfig)

// Public routes — no auth needed
const PUBLIC_ROUTES = ['/', '/login', '/register', '/forgot-password']
const AUTH_ROUTES   = ['/login', '/register', '/forgot-password']

export default auth(async function middleware(req: NextRequest & { auth: { user?: { role: Role; status: string } } | null }) {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Allow public assets, API routes (handlers return JSON errors)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const isPublic = PUBLIC_ROUTES.some((r) => pathname === r)
  const isAuth   = AUTH_ROUTES.some((r) => pathname.startsWith(r))

  // Not logged in → redirect to landing
  if (!session?.user) {
    if (isPublic) return NextResponse.next()
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  const { role, status } = session.user

  // Pending / disabled accounts
  if (status !== 'ACTIVE') {
    if (pathname === '/') return NextResponse.next()
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('status', status.toLowerCase())
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
      const url = req.nextUrl.clone()
      url.pathname = '/unauthorized'
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
