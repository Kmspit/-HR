import { NextRequest, NextResponse } from 'next/server'
import { runWarningCheck } from '@/lib/warningEngine'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== (process.env.CRON_SECRET ?? 'hrflow-cron-secret')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await runWarningCheck()
    return NextResponse.json({ success: true, warned: results.length, results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
