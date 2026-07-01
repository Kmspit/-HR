/**
 * POST /api/cron/sync-deploy-env
 * Copy production runtime env → hrflow-hr + hrflow-legal (Sensitive vars cannot be pulled via CLI).
 * Auth: X-Vercel-Token header (team owner CLI token).
 */
import { NextRequest, NextResponse } from 'next/server'
import { syncDeployEnvFromRuntime } from '@/lib/sync-vercel-deploy-env'
import { rejectUnauthorizedCron } from '@/lib/cron-secret'

export async function POST(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const vercelToken = req.headers.get('x-vercel-token')?.trim()
  if (!vercelToken) {
    return NextResponse.json({ error: 'Missing X-Vercel-Token' }, { status: 401 })
  }

  try {
    const results = await syncDeployEnvFromRuntime(vercelToken)
    const ok = results.every((r) => r.errors.length === 0)
    return NextResponse.json({ ok, results }, { status: ok ? 200 : 207 })
  } catch (err) {
    console.error('[cron/sync-deploy-env]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 },
    )
  }
}
