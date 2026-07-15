/**
 * POST /api/security/2fa/verify
 * Body: { challenge, code, pendingToken? }
 * On success: sets full session cookie, returns { ok: true, url }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyOtp } from '@/lib/otp'
import { attachSessionCookie } from '@/lib/session-token'
import { getSessionEpoch } from '@/lib/session-epoch'
import { logSecurityEvent } from '@/lib/security-events'
import { resolvePostLoginPath } from '@/lib/post-login-path'
import { verify2FAPendingToken } from '@/lib/two-fa-pending'
import { rateLimit } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-handler'

export async function POST(req: NextRequest) {
 try {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await rateLimit(`2fa-verify:${ip}`, 20, 15 * 60 * 1000)
  if (!allowed) {
    return NextResponse.json({ error: 'ลองใหม่ภายหลัง' }, { status: 429 })
  }

  const body = await req.json() as { challenge?: string; code?: string; pendingToken?: string }
  const { challenge, code, pendingToken } = body

  if (!challenge || !code) {
    return NextResponse.json({ error: 'challenge and code required' }, { status: 400 })
  }
  if (!pendingToken) {
    return NextResponse.json({ error: 'pendingToken required' }, { status: 400 })
  }

  const pendingUserId = await verify2FAPendingToken(pendingToken)
  if (!pendingUserId) {
    return NextResponse.json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  }

  const result = await verifyOtp(challenge, code, 'TWO_FA_LOGIN')

  if (!result.valid || !result.userId) {
    return NextResponse.json({ error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' }, { status: 401 })
  }

  if (pendingUserId !== result.userId) {
    return NextResponse.json({ error: 'รหัส OTP ไม่ตรงกับบัญชี' }, { status: 403 })
  }

  const setup = await prisma.twoFactorSetup.findUnique({
    where: { userId: result.userId },
    select: { enabled: true },
  })
  if (!setup?.enabled) {
    return NextResponse.json({ error: '2FA not enabled for this account' }, { status: 403 })
  }

  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: {
      id: true, email: true, name: true, role: true, status: true,
      department: true, branchId: true,
      divisionId: true, departmentId: true, sectionId: true,
    },
  })

  if (!user || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'บัญชีไม่พร้อมใช้งาน' }, { status: 403 })
  }

  const userAgent = req.headers.get('user-agent') ?? undefined

  await logSecurityEvent({
    userId:      user.id,
    eventType:   'LOGIN_SUCCESS',
    severity:    'INFO',
    description: 'Login completed via 2FA OTP',
    ip,
    userAgent,
  })

  const { path, message } = resolvePostLoginPath(user)

  const response = NextResponse.json({ ok: true, url: path, message })
  await attachSessionCookie(response, {
    id:         user.id,
    email:      user.email,
    name:       user.name,
    role:       user.role,
    status:     user.status,
    department: user.department ?? null,
    branchId:   user.branchId ?? null,
    sessionEpoch: await getSessionEpoch(user.id),
  })

  return response
} catch (err) {
  return apiError(err)
 }
}
