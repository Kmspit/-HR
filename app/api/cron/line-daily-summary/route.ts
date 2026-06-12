/**
 * CEO Daily Summary Cron — Phase 14
 * Schedule: 0 2 * * * (02:00 UTC = 09:00 Bangkok)
 * Pushes a LINE Flex summary card to all CEO/SUPER_ADMIN users with lineUserId.
 */
import { NextRequest, NextResponse } from 'next/server'
import { broadcastLineDailySummary } from '@/lib/line-notifications'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sent, errors } = await broadcastLineDailySummary()
  return NextResponse.json({ ok: true, sent, errors })
}
