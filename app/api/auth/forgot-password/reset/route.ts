/**
 * POST /api/auth/forgot-password/reset
 * Body: { email, code, newPassword, confirmPassword }
 * Challenge is read from httpOnly cookie (set on request).
 */
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { verifyOtp } from '@/lib/otp'
import { validateChangePasswordInput } from '@/lib/change-password'
import { assertEnglishCredential } from '@/lib/english-input'
import { logSecurityEvent } from '@/lib/security-events'
import { rateLimit } from '@/lib/rate-limit'
import { FP_CHALLENGE_COOKIE, clearForgotPasswordChallengeCookie } from '@/lib/forgot-password-cookie'
import { bumpSessionEpoch } from '@/lib/session-epoch'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = rateLimit(`forgot-pw-reset:${ip}`, 10, 60 * 60 * 1000)
  if (!allowed) {
    return NextResponse.json({ error: 'คำขอมากเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({})) as {
    email?: string
    code?: string
    newPassword?: string
    confirmPassword?: string
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const code = typeof body.code === 'string' ? body.code : ''
  const challenge = req.cookies.get(FP_CHALLENGE_COOKIE)?.value ?? ''

  const emailErr = assertEnglishCredential(email, 'email')
  if (!email || emailErr) {
    return NextResponse.json({ error: emailErr ?? 'กรุณากรอกอีเมล' }, { status: 400 })
  }
  if (!challenge || !code) {
    return NextResponse.json({ error: 'กรุณากรอกรหัส OTP' }, { status: 400 })
  }

  const pwParsed = validateChangePasswordInput({
    currentPassword: 'ValidPass1',
    newPassword: body.newPassword,
    confirmPassword: body.confirmPassword,
  })
  if (!pwParsed.ok) {
    return NextResponse.json({ error: pwParsed.error, field: pwParsed.field }, { status: 400 })
  }

  const otpResult = await verifyOtp(challenge, code, 'FORGOT_PASSWORD')
  if (!otpResult.valid || !otpResult.userId) {
    return NextResponse.json({ error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: otpResult.userId },
    select: { id: true, email: true, status: true },
  })
  if (!user || user.email !== email || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'ไม่สามารถรีเซ็ตรหัสผ่านได้' }, { status: 403 })
  }

  const passwordHash = await bcrypt.hash(pwParsed.data.newPassword, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordChangedAt: new Date() },
  })
  await bumpSessionEpoch(user.id)

  await logSecurityEvent({
    userId: user.id,
    eventType: 'PASSWORD_CHANGED',
    severity: 'INFO',
    description: `Password reset via forgot-password for ${user.email}`,
    ip: req.headers.get('x-forwarded-for') ?? undefined,
    userAgent: req.headers.get('user-agent') ?? undefined,
  })

  const res = NextResponse.json({ ok: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' })
  clearForgotPasswordChallengeCookie(res)
  return res
}
