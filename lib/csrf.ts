import { NextRequest, NextResponse } from 'next/server'

/**
 * Origin validation for CSRF protection on mutation endpoints.
 *
 * Usage in a route handler:
 *   const csrfError = validateCsrfOrigin(req)
 *   if (csrfError) return csrfError
 *
 * Why: Although Next.js SameSite=Lax cookies already prevent most CSRF attacks,
 * this provides defence-in-depth for sensitive operations (payroll, role changes, etc.).
 *
 * Allowlist: same origin + LINE webhook origin (external POST)
 */

const LINE_ORIGIN = 'https://api.line.me'

export function validateCsrfOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin')
  if (!origin) return null  // server-to-server or same-origin (no Origin header sent)

  if (origin === LINE_ORIGIN) return null  // allow LINE webhook

  const host = req.headers.get('host') ?? ''
  try {
    const originHost = new URL(origin).host
    if (originHost === host) return null  // same-origin — OK
    // In dev, also allow localhost variants
    if (process.env.NODE_ENV === 'development') {
      if (originHost.startsWith('localhost') || originHost.startsWith('127.0.0.1')) return null
    }
  } catch {
    // malformed origin
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 })
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase())
}

/**
 * API routes that legitimately receive cross-origin mutating requests without
 * a same-origin browser session — each authenticates via its own shared-secret
 * or signature check instead of a cookie, so origin-based CSRF protection
 * doesn't apply and would break them. Verified individually (round-3 audit):
 *   - /api/line/webhook            — LINE HMAC signature (x-line-signature)
 *   - /api/cron/sync-deploy-env    — shared CRON_SECRET (+ X-Vercel-Token)
 *   - /api/cron/invoice-reminders  — shared CRON_SECRET
 *   - /api/cron/contract-reminders — shared CRON_SECRET
 *   - /api/leave/prototype         — PROTOTYPE_BRIDGE_SECRET header
 *   - /api/line/prototype-notify   — PROTOTYPE_BRIDGE_SECRET header (checked
 *                                    before the session it also requires)
 * None of these have a session-cookie-only code path a cross-site request
 * could ride on. Keep this list in sync with that audit.
 */
const CSRF_EXEMPT_API_ROUTES = [
  '/api/line/webhook',
  '/api/cron/sync-deploy-env',
  '/api/cron/invoice-reminders',
  '/api/cron/contract-reminders',
  '/api/leave/prototype',
  '/api/line/prototype-notify',
]

export function isCsrfExemptApiRoute(pathname: string): boolean {
  return CSRF_EXEMPT_API_ROUTES.includes(pathname)
}

/**
 * Global CSRF gate for API routes — call once in middleware for every
 * /api/* request. Returns a 403 response to short-circuit the request, or
 * null to let it continue. Individual route handlers no longer need their
 * own requireCsrf()/validateCsrfOrigin() call now that this runs centrally.
 */
export function csrfGateForApiRoute(req: NextRequest, pathname: string): NextResponse | null {
  if (!isMutatingMethod(req.method)) return null
  if (isCsrfExemptApiRoute(pathname)) return null
  return validateCsrfOrigin(req)
}
