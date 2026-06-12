/**
 * GET /api/security/events — recent security events (CEO/SUPER_ADMIN/HR only)
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = ['CEO', 'SUPER_ADMIN', 'HR', 'MANAGER_HR'] as const

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const severity = searchParams.get('severity')
  const take     = Math.min(parseInt(searchParams.get('take') ?? '50'), 200)

  const events = await prisma.securityEvent.findMany({
    where: severity ? { severity } : undefined,
    orderBy: { createdAt: 'desc' },
    take,
    include: { user: { select: { name: true, email: true } } },
  })

  return NextResponse.json({ events })
}
