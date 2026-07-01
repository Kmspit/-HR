/**
 * POST /api/auth/forgot-password/request
 * Body: { email }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createOtp } from '@/lib/otp'
import { pushLineMessages } from '@/lib/line-api'
import { rateLimit } from '@/lib/rate-limit'
import { assertEnglishCredential } from '@/lib/english-input'
import { setForgotPasswordChallengeCookie, FP_CHALLENGE_COOKIE, clearForgotPasswordChallengeCookie } from '@/lib/forgot-password-cookie'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = rateLimit(`forgot-pw:${ip}`, 5, 60 * 60 * 1000)
  if (!allowed) {
    return NextResponse.json({ error: 'คำขอมากเกินไป กรุณารอ 1 ชั่วโมงแล้วลองใหม่' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({})) as { email?: string }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  const englishErr = assertEnglishCredential(email, 'email')
  if (!email || englishErr) {
    return NextResponse.json({ error: englishErr ?? 'กรุณากรอกอีเมล' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, lineUserId: true, status: true },
  })

  // Uniform response — no email enumeration
  const uniform = NextResponse.json({
    ok: true,
    message: 'หากอีเมลนี้อยู่ในระบบ เราได้ส่งรหัส OTP แล้ว',
  })

  if (!user || user.status !== 'ACTIVE') {
    return uniform
  }

  const { challenge, code } = await createOtp(user.id, 'FORGOT_PASSWORD', 'LINE')

  if (user.lineUserId) {
    await pushLineMessages(user.lineUserId, [
      {
        type: 'text',
        text: `🔐 รหัส OTP สำหรับรีเซ็ตรหัสผ่าน: ${code}\n\nใช้ได้ภายใน 15 นาที\nอย่าแชร์รหัสนี้กับใคร`,
      },
    ]).catch(() => {})
  }

  setForgotPasswordChallengeCookie(uniform, challenge)
  return uniform
}
