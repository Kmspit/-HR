import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyLoginCredentials } from '@/lib/login-credentials'
import { attachSessionCookie } from '@/lib/session-token'
import { resolvePostLoginPath } from '@/lib/post-login-path'
import { ensureDbSchema } from '@/lib/ensure-db-schema'
import { checkLoginAllowed, recordLoginAttempt } from '@/lib/login-protection'
import { logSecurityEvent } from '@/lib/security-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERROR_HTTP: Record<string, number> = {
  MISSING_FIELDS: 400,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 429,
  PENDING_APPROVAL: 403,
  ACCOUNT_DISABLED: 403,
  ACCOUNT_REJECTED: 403,
  AUTH_SECRET_MISSING: 500,
}

async function loadUserForRedirect(userId: string, fallback: {
  role: import('@prisma/client').Role
  status: import('@prisma/client').UserStatus
}) {
  try {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        status: true,
        divisionId: true,
        departmentId: true,
        sectionId: true,
      },
    })
  } catch (err) {
    console.error('[login] loadUserForRedirect', err)
    return {
      role: fallback.role,
      status: fallback.status,
      divisionId: null,
      departmentId: null,
      sectionId: null,
    }
  }
}

/**
 * ล็อกอิน + สร้าง session + คืน URL ปลายทาง
 */
export async function POST(req: NextRequest) {
  try {
    try {
      await ensureDbSchema()
    } catch (schemaErr) {
      console.error('[api/auth/login] ensureDbSchema', schemaErr)
    }

    const ip        = req.headers.get('x-forwarded-for') ?? undefined
    const userAgent = req.headers.get('user-agent') ?? undefined

    const body = await req.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email : ''
    const password = typeof body.password === 'string' ? body.password : ''

    // Phase 15: brute-force check
    const lockCheck = await checkLoginAllowed(email).catch(() => ({ allowed: true }))
    if (!lockCheck.allowed) {
      return NextResponse.json(
        { ok: false, error: 'ACCOUNT_LOCKED', message: 'บัญชีถูกล็อคชั่วคราว กรุณาลองใหม่ใน 15 นาที' },
        { status: 429 },
      )
    }

    const verified = await verifyLoginCredentials(email, password)
    if (!verified.ok) {
      await recordLoginAttempt(email, false, { ip, userAgent, reason: verified.error }).catch(() => {})
      return NextResponse.json(
        { ok: false, error: verified.error },
        { status: ERROR_HTTP[verified.error] ?? 401 },
      )
    }

    // Phase 15: check 2FA
    const setup2fa = await prisma.twoFactorSetup.findUnique({
      where: { userId: verified.user.id },
      select: { enabled: true, channel: true },
    }).catch(() => null)

    if (setup2fa?.enabled) {
      // Record as partial success (credentials OK, but 2FA pending)
      await recordLoginAttempt(email, true, { ip, userAgent, userId: verified.user.id, reason: '2FA_PENDING' }).catch(() => {})
      return NextResponse.json({ ok: false, requires2FA: true, userId: verified.user.id })
    }

    await recordLoginAttempt(email, true, { ip, userAgent, userId: verified.user.id }).catch(() => {})
    await logSecurityEvent({
      userId: verified.user.id, eventType: 'LOGIN_SUCCESS', severity: 'INFO',
      description: 'Login successful', ip, userAgent,
    }).catch(() => {})

    const dbUser = await loadUserForRedirect(verified.user.id, {
      role: verified.user.role,
      status: verified.user.status,
    })

    const resolveInput = dbUser ?? {
      role: verified.user.role,
      status: verified.user.status,
      divisionId: null,
      departmentId: null,
      sectionId: null,
    }
    const { path, message } = resolvePostLoginPath(resolveInput)

    const response = NextResponse.json({
      ok: true,
      url: path,
      message,
    })

    return await attachSessionCookie(response, verified.user)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error('[LOGIN FATAL ERROR]', err)
    console.error('[api/auth/login] UNHANDLED ERROR:', msg)
    console.error('[api/auth/login] stack:', stack)

    if (msg === 'AUTH_SECRET_MISSING') {
      return NextResponse.json(
        { ok: false, error: 'AUTH_SECRET_MISSING', message: 'ระบบยังไม่ได้ตั้งค่า AUTH_SECRET' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      { ok: false, error: 'SERVER_ERROR', message: 'ระบบขัดข้อง กรุณาลองใหม่' },
      { status: 500 },
    )
  }
}
