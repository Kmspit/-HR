import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

type CheckStatus = 'ok' | 'warn' | 'error'
interface HealthCheck { status: CheckStatus; latencyMs?: number; detail?: string }

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const start = Date.now()
  const checks: Record<string, HealthCheck> = {}

  // Database connectivity
  try {
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart }
  } catch (e) {
    checks.database = { status: 'error', detail: String(e).slice(0, 200) }
  }

  // User count sanity check
  try {
    const count = await prisma.user.count()
    checks.userCount = { status: 'ok', detail: `${count} users` }
  } catch (e) {
    checks.userCount = { status: 'warn', detail: String(e).slice(0, 100) }
  }

  // Environment variables
  const requiredEnv = ['AUTH_SECRET', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']
  const missing = requiredEnv.filter(k => !process.env[k])
  checks.environment = missing.length === 0
    ? { status: 'ok' }
    : { status: 'error', detail: `Missing: ${missing.join(', ')}` }

  // Cloudinary
  checks.cloudinary = process.env.CLOUDINARY_CLOUD_NAME
    ? { status: 'ok', detail: process.env.CLOUDINARY_CLOUD_NAME }
    : { status: 'warn', detail: 'CLOUDINARY_CLOUD_NAME not set — photo uploads will fail' }

  // LINE integration
  checks.line = process.env.LINE_CHANNEL_ACCESS_TOKEN
    ? { status: 'ok' }
    : { status: 'warn', detail: 'LINE_CHANNEL_ACCESS_TOKEN not set — LINE notifications disabled' }

  // AI (Anthropic)
  checks.ai = process.env.ANTHROPIC_API_KEY
    ? { status: 'ok' }
    : { status: 'warn', detail: 'ANTHROPIC_API_KEY not set — AI assistant disabled' }

  const statuses = Object.values(checks).map(c => c.status)
  const overall: CheckStatus = statuses.includes('error') ? 'error'
    : statuses.includes('warn') ? 'warn' : 'ok'

  return NextResponse.json({
    status: overall,
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - start,
    checks,
  })
}
