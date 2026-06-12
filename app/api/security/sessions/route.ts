/**
 * GET  /api/security/sessions — list all active device sessions for current user
 * DELETE /api/security/sessions — revoke all other sessions
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSecurityEvent } from '@/lib/security-events'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessions = await prisma.deviceSession.findMany({
    where:   { userId: session.user.id, isRevoked: false },
    orderBy: { lastSeenAt: 'desc' },
    take:    20,
  })

  return NextResponse.json({ sessions })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { keepSessionId?: string }

  await prisma.deviceSession.updateMany({
    where: {
      userId:    session.user.id,
      isRevoked: false,
      ...(body.keepSessionId ? { sessionId: { not: body.keepSessionId } } : {}),
    },
    data: { isRevoked: true },
  })

  await logSecurityEvent({
    userId:      session.user.id,
    eventType:   'SESSION_REVOKED',
    severity:    'WARNING',
    description: 'All other sessions revoked by user',
    ip:          req.headers.get('x-forwarded-for') ?? undefined,
    userAgent:   req.headers.get('user-agent') ?? undefined,
  })

  return NextResponse.json({ ok: true })
}
