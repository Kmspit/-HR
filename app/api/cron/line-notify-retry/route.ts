import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-secret'
import { apiError } from '@/lib/api-handler'
import { retryAllFailedAttendanceLineNotify, MAX_CRON_RETRY_COUNT } from '@/lib/attendance-line-notify'

/** Daily retry for attendance LINE notify pushes stuck at status='failed'.
 *  Caps retryCount (MAX_CRON_RETRY_COUNT) so a long LINE outage doesn't retry forever —
 *  rows that hit the cap stay 'failed' and are still retryable manually from the
 *  security dashboard's "Retry ทั้งหมดตอนนี้" button. */
export async function POST(req: NextRequest) {
 try {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const result = await retryAllFailedAttendanceLineNotify({ maxRetryCount: MAX_CRON_RETRY_COUNT, limit: 50 })
  return NextResponse.json({ ok: true, ...result })
} catch (err) {
  return apiError(err)
 }
}

export async function GET(req: NextRequest) {
 try {
  return POST(req)
} catch (err) {
  return apiError(err)
 }
}
