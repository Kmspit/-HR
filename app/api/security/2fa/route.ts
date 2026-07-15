/**
 * GET  /api/security/2fa — get current 2FA status for the session user
 * POST /api/security/2fa — enable or disable 2FA (disable requires currentPassword)
 */
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSecurityEvent } from '@/lib/security-events'
import { assertEnglishCredential } from '@/lib/english-input'
import { apiError } from '@/lib/api-handler'

export async function GET() {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setup = await prisma.twoFactorSetup.findUnique({ where: { userId: session.user.id } })

  return NextResponse.json({
    enabled:  setup?.enabled ?? false,
    channel:  setup?.channel ?? 'LINE',
    enabledAt: setup?.enabledAt ?? null,
  })
} catch (err) {
  return apiError(err)
 }
}

export async function POST(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { enabled: boolean; channel?: string; currentPassword?: string }
  const { enabled, channel = 'LINE', currentPassword } = body

  if (enabled === false) {
    const pwErr = assertEnglishCredential(currentPassword ?? '', 'password')
    if (!currentPassword || pwErr) {
      return NextResponse.json({ error: 'กรุณากรอกรหัสผ่านปัจจุบันเพื่อปิด 2FA' }, { status: 400 })
    }
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    })
    if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, { status: 400 })
    }
  }

  const setup = await prisma.twoFactorSetup.upsert({
    where:  { userId: session.user.id },
    create: { userId: session.user.id, enabled, channel, enabledAt: enabled ? new Date() : null },
    update: { enabled, channel, enabledAt: enabled ? new Date() : null },
  })

  await logSecurityEvent({
    userId:      session.user.id,
    eventType:   enabled ? 'TWO_FACTOR_ENABLED' : 'TWO_FACTOR_DISABLED',
    severity:    'INFO',
    description: `2FA ${enabled ? 'enabled' : 'disabled'} via ${channel}`,
    ip:          req.headers.get('x-forwarded-for') ?? undefined,
    userAgent:   req.headers.get('user-agent') ?? undefined,
  })

  return NextResponse.json({ enabled: setup.enabled, channel: setup.channel })
} catch (err) {
  return apiError(err)
 }
}
