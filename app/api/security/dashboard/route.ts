/**
 * GET /api/security/dashboard — security KPI stats
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = ['CEO', 'SUPER_ADMIN', 'HR', 'MANAGER_HR'] as const

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const since24h = new Date(Date.now() - 24 * 3600_000)
  const since7d  = new Date(Date.now() - 7 * 86400_000)

  try {
    const [
      failedLogins24h,
      criticalEvents7d,
      activeSessions,
      lockedAccounts,
      recentBackup,
      totalBackups,
    ] = await Promise.all([
      prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: since24h } } }),
      prisma.securityEvent.count({ where: { severity: 'CRITICAL', createdAt: { gte: since7d } } }),
      prisma.deviceSession.count({ where: { isRevoked: false } }),
      prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
      prisma.backupRecord.findFirst({ where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } }),
      prisma.backupRecord.count(),
    ])

    return NextResponse.json({
      failedLogins24h,
      criticalEvents7d,
      activeSessions,
      lockedAccounts,
      lastBackupAt: recentBackup?.createdAt ?? null,
      totalBackups,
    })
  } catch (error) {
    console.error('[security/dashboard GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
