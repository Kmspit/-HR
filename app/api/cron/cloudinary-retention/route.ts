import { NextRequest, NextResponse } from 'next/server'
import { runImageRetentionCleanup } from '@/lib/cloudinary-service'
import { cronRequestAuthorized } from '@/lib/cron-secret'

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (!cronRequestAuthorized(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await runImageRetentionCleanup()
  return NextResponse.json({ success: true, ...result })
}
