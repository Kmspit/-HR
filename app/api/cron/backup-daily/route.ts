/**
 * GET /api/cron/backup-daily — daily automated backup
 * Triggered by Vercel Cron at 18:00 UTC (01:00 Bangkok next day)
 * Secured by CRON_SECRET header.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  createBackupData,
  storeBackupPayload,
  registerBackupRecord,
  buildBackupFilename,
  deriveBackupStatus,
  BACKUP_TABLE_NAMES,
} from '@/lib/backup'
import { logSecurityEvent } from '@/lib/security-events'
import { rejectUnauthorizedCron } from '@/lib/cron-secret'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const { data, errors } = await createBackupData(BACKUP_TABLE_NAMES)
    const filename = buildBackupFilename()
    const { publicId, sizeBytes } = await storeBackupPayload(data, filename)
    const status = deriveBackupStatus(errors, BACKUP_TABLE_NAMES.length)

    const record = await registerBackupRecord({
      filename,
      sizeBytes,
      tables:          BACKUP_TABLE_NAMES,
      storagePublicId: publicId,
      status,
      errorDetail:     Object.keys(errors).length ? JSON.stringify(errors) : undefined,
      note:            'Auto daily backup',
    })

    await logSecurityEvent({
      eventType:   'BACKUP_CREATED',
      severity:    status === 'COMPLETED' ? 'INFO' : 'WARNING',
      description: `Auto daily backup: ${filename} (${bytes(sizeBytes)}, ${status}${status !== 'COMPLETED' ? `, ${Object.keys(errors).length} table(s) failed` : ''})`,
    })

    return NextResponse.json({ ok: status !== 'FAILED', recordId: record.id, filename, sizeBytes, status, errors })
  } catch (err) {
    console.error('[cron/backup-daily]', err)
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 })
  }
}

function bytes(n: number): string {
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}
