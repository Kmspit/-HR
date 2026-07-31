/**
 * GET /api/cron/backup-daily — daily automated backup
 * Triggered by Vercel Cron at 18:00 UTC (01:00 Bangkok next day)
 * Secured by CRON_SECRET header.
 */
import { NextRequest, NextResponse } from 'next/server'
import { runBackup } from '@/lib/backup'
import { rejectUnauthorizedCron } from '@/lib/cron-secret'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const { record, filename, sizeBytes, status, errors } = await runBackup({ note: 'Auto daily backup' })
    return NextResponse.json({ ok: status !== 'FAILED', recordId: record.id, filename, sizeBytes, status, errors })
  } catch (err) {
    console.error('[cron/backup-daily]', err)
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 })
  }
}
