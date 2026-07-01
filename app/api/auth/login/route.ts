import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyLoginCredentials } from '@/lib/login-credentials'
import { attachSessionCookie } from '@/lib/session-token'
import { getSessionEpoch } from '@/lib/session-epoch'
import { resolvePostLoginPath } from '@/lib/post-login-path'
import { checkLoginAllowedForIdentifier, recordLoginAttempt } from '@/lib/login-protection'
import { logSecurityEvent } from '@/lib/security-events'
import { rateLimit } from '@/lib/rate-limit'
import { assertEnglishCredential } from '@/lib/english-input'
import { create2FAPendingToken } from '@/lib/two-fa-pending'

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
    const ip        = req.headers.get('x-forwarded-for') ?? undefined
    const userAgent = req.headers.get('user-agent') ?? undefined

    const ipKey = ip?.split(',')[0]?.trim() || 'unknown'
    const { allowed: ipAllowed } = rateLimit(`login:ip:${ipKey}`, 30, 15 * 60 * 1000)
    if (!ipAllowed) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMITED', message: 'ลองใหม่ภายหลัง' },
        { status: 429 },
      )
    }

    const body = await req.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email : ''
    const password = typeof body.password === 'string' ? body.password : ''

    const emailErr = assertEnglishCredential(email.trim(), 'email')
    const pwErr = assertEnglishCredential(password, 'password')
    if (emailErr || pwErr) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_CREDENTIALS', message: emailErr ?? pwErr },
        { status: 400 },
      )
    }

    // Phase 15: brute-force check
    const lockCheck = await checkLoginAllowedForIdentifier(email).catch(() => ({ allowed: true as const }))
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
      await recordLoginAttempt(email, true, { ip, userAgent, userId: verified.user.id, reason: '2FA_PENDING' }).catch(() => {})
      const pendingToken = await create2FAPendingToken(verified.user.id)
      return NextResponse.json({ ok: false, requires2FA: true, pendingToken })
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

    return await attachSessionCookie(response, {
      ...verified.user,
      sessionEpoch: await getSessionEpoch(verified.user.id),
    })
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
