/**
 * DELETE /api/security/sessions/[id] — revoke a specific session
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSecurityEvent } from '@/lib/security-events'
import { apiError } from '@/lib/api-handler'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const deviceSession = await prisma.deviceSession.findUnique({ where: { id } })
  if (!deviceSession || deviceSession.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.deviceSession.update({ where: { id }, data: { isRevoked: true } })

  await logSecurityEvent({
    userId:      session.user.id,
    eventType:   'SESSION_REVOKED',
    severity:    'INFO',
    description: `Session ${id} revoked`,
    ip:          req.headers.get('x-forwarded-for') ?? undefined,
    userAgent:   req.headers.get('user-agent') ?? undefined,
  })

  return NextResponse.json({ ok: true })
} catch (err) {
  return apiError(err)
 }
}
