/**
 * CEO Daily Summary Cron — Phase 14
 * Schedule: 0 2 * * * (02:00 UTC = 09:00 Bangkok)
 * Pushes a LINE Flex summary card to all CEO/SUPER_ADMIN users with lineUserId.
 */
import { NextRequest, NextResponse } from 'next/server'
import { broadcastLineDailySummary } from '@/lib/line-notifications'
import { rejectUnauthorizedCron } from '@/lib/cron-secret'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const { sent, errors } = await broadcastLineDailySummary()
  return NextResponse.json({ ok: true, sent, errors })
}
