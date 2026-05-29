import { NextRequest, NextResponse } from 'next/server'
import { runWarningCheck } from '@/lib/warningEngine'
import { cronRequestAuthorized } from '@/lib/cron-secret'

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (!cronRequestAuthorized(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await runWarningCheck()
    return NextResponse.json({ success: true, warned: results.length, results })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
