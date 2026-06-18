/**
 * GET  /api/backup — list backup records
 * POST /api/backup — create a new backup
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createBackupData, registerBackupRecord, buildBackupFilename } from '@/lib/backup'
import { logSecurityEvent } from '@/lib/security-events'

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

  const tables = [
    'users', 'leaveRequests', 'leaveBalances', 'taskAssignments',
    'expenseClaims', 'payrolls', 'warnings', 'auditLogs', 'securityEvents',
  ] as const

  try {
    const data     = await createBackupData([...tables])
    const json     = JSON.stringify(data, null, 2)
    const bytes    = Buffer.byteLength(json, 'utf8')
    const filename = buildBackupFilename()

    const record = await registerBackupRecord({
      filename,
      sizeBytes:   bytes,
      tables:      [...tables],
      createdById: session.user.id,
      note:        body.note,
    })

    await logSecurityEvent({
      userId:      session.user.id,
      eventType:   'BACKUP_CREATED',
      severity:    'INFO',
      description: `Manual backup created: ${filename}`,
      ip:          req.headers.get('x-forwarded-for') ?? undefined,
      userAgent:   req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({ record, filename, sizeBytes: bytes })
  } catch (error) {
    console.error('[backup POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
