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
import { padToMinDuration } from '@/lib/timing-safety'
import { setForgotPasswordChallengeCookie, FP_CHALLENGE_COOKIE, clearForgotPasswordChallengeCookie } from '@/lib/forgot-password-cookie'

// Both branches below (account exists vs. doesn't) are padded to at least
// this long before responding, so measuring response time can't be used to
// tell them apart — the JSON body was already uniform, but the "account
// exists" path used to take noticeably longer (an OTP DB write + a LINE API
// call), a timing side-channel that leaked the same thing the uniform
// message was meant to hide.
const MIN_RESPONSE_MS = 400

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await rateLimit(`forgot-pw:${ip}`, 5, 60 * 60 * 1000)
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
    await padToMinDuration(startedAt, MIN_RESPONSE_MS)
    return uniform
  }

  // Per-account throttle, in addition to the per-IP one above — otherwise an
  // attacker spreading requests across many IPs can still flood one person's
  // LINE with OTP messages (the per-IP limit alone doesn't stop that). Silently
  // skip sending another OTP once this account's own limit is hit — still
  // returning the same uniform response, so this can't be used as another
  // account-existence oracle.
  const { allowed: acctAllowed } = await rateLimit(`forgot-pw:acct:${user.id}`, 5, 60 * 60 * 1000)
  if (!acctAllowed) {
    await padToMinDuration(startedAt, MIN_RESPONSE_MS)
    return uniform
  }

  const { challenge, code } = await createOtp(user.id, 'FORGOT_PASSWORD', 'LINE')

  if (user.lineUserId) {
    // Fire-and-forget — the client doesn't need to wait on the LINE round-trip,
    // and waiting on it would make the timing gap between the two branches
    // above even wider.
    void pushLineMessages(user.lineUserId, [
      {
        type: 'text',
        text: `🔐 รหัส OTP สำหรับรีเซ็ตรหัสผ่าน: ${code}\n\nใช้ได้ภายใน 15 นาที\nอย่าแชร์รหัสนี้กับใคร`,
      },
    ]).catch(() => {})
  }

  setForgotPasswordChallengeCookie(uniform, challenge)
  await padToMinDuration(startedAt, MIN_RESPONSE_MS)
  return uniform
}
