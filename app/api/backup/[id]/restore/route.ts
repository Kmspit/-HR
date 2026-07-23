/**
 * POST /api/backup/[id]/restore — restore ONE table from a stored backup.
 *
 * Two-step by design (this is the most dangerous endpoint in the app):
 *   1. { table, dryRun: true }  — no writes. Returns counts only: how many rows
 *      the backup has for this table, how many IDs already exist live (would be
 *      skipped), how many would actually be inserted.
 *   2. { table, dryRun: false, confirmText: table } — confirmText must be an
 *      exact, case-sensitive match for `table`, or the request is rejected
 *      before touching the DB. Only then does it write.
 *
 * Semantics: insert-only, skip-if-exists. A row whose `id` already exists in the
 * live table is left untouched — this can never overwrite/clobber current data,
 * it can only "fill back in" rows that are missing. If you need to revert a row
 * that was *modified* (not deleted) after the backup, this endpoint intentionally
 * will not do that — restoring an edited-but-still-present row is a manual DB
 * operation, not a one-click button, by design.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { loadBackupPayload, BACKUP_TABLE_SPECS } from '@/lib/backup'
import { logSecurityEvent } from '@/lib/security-events'

const ALLOWED_ROLES = ['CEO', 'SUPER_ADMIN'] as const

type Ctx = { params: Promise<{ id: string }> }
type Body = { table?: string; dryRun?: boolean; confirmText?: string }

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({})) as Body
  const { table, dryRun = true, confirmText } = body

  if (!table) return NextResponse.json({ error: 'table is required' }, { status: 400 })

  const spec = BACKUP_TABLE_SPECS.find((s) => s.table === table)
  if (!spec) return NextResponse.json({ error: `unknown table "${table}"` }, { status: 400 })

  const record = await prisma.backupRecord.findUnique({ where: { id } })
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!record.storagePublicId) {
    return NextResponse.json({ error: 'backup ตัวนี้ไม่มีข้อมูลจริงเก็บไว้ (สร้างก่อนระบบ backup ถูกแก้ไข) — restore ไม่ได้' }, { status: 410 })
  }
  if (!record.tables.split(',').includes(table)) {
    return NextResponse.json({ error: `backup นี้ไม่มีตาราง "${table}" อยู่ในขอบเขต` }, { status: 400 })
  }

  if (!dryRun) {
    if (confirmText !== table) {
      return NextResponse.json({ error: 'confirmText ต้องตรงกับชื่อตารางเป๊ะๆ เพื่อยืนยัน' }, { status: 400 })
    }
  }

  const payload = await loadBackupPayload(record.storagePublicId)
  if (!payload) {
    return NextResponse.json({ error: 'ไม่พบไฟล์ backup ใน storage' }, { status: 404 })
  }
  const rows = (payload[table] ?? []) as Record<string, unknown>[]
  if (rows.length === 0) {
    return NextResponse.json({ table, dryRun, totalInBackup: 0, alreadyExists: 0, wouldInsert: 0, inserted: 0, skipped: 0, failed: 0, errors: [] })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (prisma as any)[spec.accessor]
  const ids = rows.map((r) => r.id as string).filter(Boolean)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing: { id: string }[] = await model.findMany({ where: { id: { in: ids } }, select: { id: true } })
  const existingIds = new Set(existing.map((r) => r.id))
  const toInsert = rows.filter((r) => !existingIds.has(r.id as string))

  if (dryRun) {
    return NextResponse.json({
      table,
      dryRun: true,
      totalInBackup: rows.length,
      alreadyExists: existingIds.size,
      wouldInsert:   toInsert.length,
    })
  }

  let inserted = 0
  let failed = 0
  const errors: { id: unknown; message: string }[] = []

  for (const row of toInsert) {
    try {
      await model.create({ data: row })
      inserted++
    } catch (err) {
      failed++
      errors.push({ id: row.id, message: err instanceof Error ? err.message : String(err) })
    }
  }

  await logSecurityEvent({
    userId:      session.user.id,
    eventType:   'BACKUP_RESTORED',
    severity:    'CRITICAL',
    description: `Restore executed: table="${table}" from backup "${record.filename}" — inserted ${inserted}, skipped ${existingIds.size} (already existed), failed ${failed}`,
    ip:          req.headers.get('x-forwarded-for') ?? undefined,
    userAgent:   req.headers.get('user-agent') ?? undefined,
  })

  return NextResponse.json({
    table,
    dryRun: false,
    totalInBackup: rows.length,
    alreadyExists: existingIds.size,
    inserted,
    skipped: existingIds.size,
    failed,
    errors,
  })
}
