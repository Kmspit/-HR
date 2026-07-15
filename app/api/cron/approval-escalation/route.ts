import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cronRequestAuthorized } from '@/lib/cron-secret'
import { runApprovalEscalation } from '@/lib/approval-escalation'

export const dynamic = 'force-dynamic'

/** Remind approvers after 48h; escalate to CEO/HR after 72h — Vercel Cron */
export async function GET(req: NextRequest) {
  const secret =
    req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (!cronRequestAuthorized(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runApprovalEscalation(prisma)
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[cron/approval-escalation]', message, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
