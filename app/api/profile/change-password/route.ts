/**
 * POST /api/profile/change-password
 * Body: { currentPassword, newPassword, confirmPassword }
 */
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { validateChangePasswordInput } from '@/lib/change-password'
import { logSecurityEvent } from '@/lib/security-events'
import { bumpSessionEpoch } from '@/lib/session-epoch'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as {
      currentPassword?: string
      newPassword?: string
      confirmPassword?: string
    }

    const parsed = validateChangePasswordInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, passwordHash: true },
    })
    if (!user?.passwordHash) {
      return NextResponse.json({ error: 'ไม่พบบัญชี' }, { status: 404 })
    }

    const currentValid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)
    if (!currentValid) {
      return NextResponse.json(
        { error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง', field: 'currentPassword' },
        { status: 400 },
      )
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12)
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
      },
    })
    await bumpSessionEpoch(session.user.id)

    await logSecurityEvent({
      userId: session.user.id,
      eventType: 'PASSWORD_CHANGED',
      severity: 'INFO',
      description: `User ${user.email} changed password`,
      ip: req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({ ok: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' })
  } catch (err) {
    return apiError(err)
  }
}
