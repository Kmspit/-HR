import { NextRequest, NextResponse } from 'next/server'
import { runImageRetentionCleanup } from '@/lib/cloudinary-service'

function cronAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? 'hrflow-cron-secret'
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const header = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  return bearer === expected || header === expected
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await runImageRetentionCleanup()
  return NextResponse.json({ success: true, ...result })
}
