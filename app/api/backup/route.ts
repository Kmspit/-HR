/**
 * GET  /api/backup — list backup records
 * POST /api/backup — create a new backup
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runBackup } from '@/lib/backup'

export const maxDuration = 300

const ALLOWED_ROLES = ['CEO', 'SUPER_ADMIN'] as const

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const records = await prisma.backupRecord.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ records })
  } catch (error) {
    console.error('[backup GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { note?: string }

  try {
    const { record, filename, sizeBytes, status, errors } = await runBackup({
      createdById: session.user.id,
      note:        body.note,
      ip:          req.headers.get('x-forwarded-for') ?? undefined,
      userAgent:   req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({ record, filename, sizeBytes, status, errors })
  } catch (error) {
    console.error('[backup POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
