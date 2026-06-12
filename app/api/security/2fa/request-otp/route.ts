/**
 * POST /api/security/2fa/request-otp
 * Called during login when 2FA is required.
 * Body: { email }
 * Returns: { challenge } (the challenge UUID to pass to verify)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createOtp } from '@/lib/otp'
import { pushLineMessages } from '@/lib/line-api'

export async function POST(req: NextRequest) {
  const body = await req.json() as { email?: string }
  const { email } = body

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, lineUserId: true },
  })

  if (!user) {
    // Return a fake challenge so enumeration is not possible
    return NextResponse.json({ challenge: 'invalid', sent: false })
  }

  const setup = await prisma.twoFactorSetup.findUnique({
    where: { userId: user.id },
    select: { enabled: true, channel: true },
  })

  if (!setup?.enabled) {
    return NextResponse.json({ error: '2FA not enabled' }, { status: 400 })
  }

  const { challenge, code } = await createOtp(user.id, setup.channel)

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
