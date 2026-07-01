/**
 * GET /api/cron/backup-daily — daily automated backup
 * Triggered by Vercel Cron at 01:00 UTC (08:00 Bangkok)
 * Secured by CRON_SECRET header.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createBackupData, registerBackupRecord, buildBackupFilename } from '@/lib/backup'
import { logSecurityEvent } from '@/lib/security-events'
import { rejectUnauthorizedCron } from '@/lib/cron-secret'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const tables = [
      'users', 'leaveRequests', 'leaveBalances', 'taskAssignments',
      'expenseClaims', 'payrolls', 'warnings', 'auditLogs', 'securityEvents',
    ] as const

    const data     = await createBackupData([...tables])
    const json     = JSON.stringify(data)
    const bytes    = Buffer.byteLength(json, 'utf8')
    const filename = buildBackupFilename()

    const record = await registerBackupRecord({
      filename,
      sizeBytes: bytes,
      tables:    [...tables],
      note:      'Auto daily backup',
    })

    await logSecurityEvent({
      eventType:   'BACKUP_CREATED',
      severity:    'INFO',
      description: `Auto daily backup: ${filename} (${bytes} bytes)`,
    })

    return NextResponse.json({ ok: true, recordId: record.id, filename, sizeBytes: bytes })
  } catch (err) {
    console.error('[cron/backup-daily]', err)
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 })
  }
}
