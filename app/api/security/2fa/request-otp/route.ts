/**
 * POST /api/security/2fa/request-otp
 * Called during login when 2FA is required.
 * Body: { pendingToken }
 * Returns: { challenge } (the challenge UUID to pass to verify)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createOtp } from '@/lib/otp'
import { pushLineMessages } from '@/lib/line-api'
import { verify2FAPendingToken } from '@/lib/two-fa-pending'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await rateLimit(`2fa-otp:${ip}`, 10, 15 * 60 * 1000)
  if (!allowed) {
    return NextResponse.json({ error: 'คำขอมากเกินไป กรุณารอแล้วลองใหม่' }, { status: 429 })
  }

  const body = await req.json() as { pendingToken?: string }
  const { pendingToken } = body

  if (!pendingToken) return NextResponse.json({ error: 'pendingToken required' }, { status: 400 })

  const userId = await verify2FAPendingToken(pendingToken)
  if (!userId) {
    return NextResponse.json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, lineUserId: true, status: true },
  })

  if (!user || user.status !== 'ACTIVE') {
    return NextResponse.json({ challenge: 'invalid', sent: false })
  }

  const setup = await prisma.twoFactorSetup.findUnique({
    where: { userId: user.id },
    select: { enabled: true, channel: true },
  })

  if (!setup?.enabled) {
    return NextResponse.json({ error: '2FA not enabled' }, { status: 400 })
  }

  // Per-account throttle, in addition to the per-IP one above — a valid
  // pendingToken already proves the caller knows this account's password, but
  // without this an attacker who has it could still flood the account's LINE
  // with OTP messages by spreading requests across IPs.
  const { allowed: acctAllowed } = await rateLimit(`2fa-otp:acct:${user.id}`, 10, 15 * 60 * 1000)
  if (!acctAllowed) {
    return NextResponse.json({ error: 'คำขอมากเกินไป กรุณารอแล้วลองใหม่' }, { status: 429 })
  }

  const { challenge, code } = await createOtp(user.id, 'TWO_FA_LOGIN', setup.channel)

  if (setup.channel === 'LINE' && user.lineUserId) {
    await pushLineMessages(user.lineUserId, [
      {
        type: 'text',
        text: `🔐 รหัส OTP ของคุณคือ: ${code}\n\nใช้ได้ภายใน 15 นาที\nอย่าแชร์รหัสนี้กับใคร`,
      },
    ]).catch(() => {})
  }

  return NextResponse.json({ challenge, sent: true })
}
