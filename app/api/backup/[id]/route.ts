/**
 * GET    /api/backup/[id]          — get backup record metadata
 * GET    /api/backup/[id]?download=1 — stream backup JSON as file download
 * DELETE /api/backup/[id]          — delete backup record
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createBackupData } from '@/lib/backup'
import type { BackupTableName } from '@/lib/backup'

const ALLOWED_ROLES = ['CEO', 'SUPER_ADMIN'] as const

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const record = await prisma.backupRecord.findUnique({ where: { id } })
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const download = new URL(req.url).searchParams.get('download') === '1'

  if (!download) {
    return NextResponse.json({ record })
  }

  // Regenerate the data on-demand (JSON stored in DB metadata only, not files)
  const tables = record.tables.split(',') as BackupTableName[]
  const data   = await createBackupData(tables)
  const json   = JSON.stringify(data, null, 2)

  return new NextResponse(json, {
    headers: {
      'Content-Type':        'application/json',
      'Content-Disposition': `attachment; filename="${record.filename}"`,
    },
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await prisma.backupRecord.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
