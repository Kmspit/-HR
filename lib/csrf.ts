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
