/**
 * GET /api/security/dashboard — security KPI stats
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isLineOaConfiguredAsync } from '@/lib/line-config'

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
      lineOaConfigured,
      hrLineRecipientCount,
      lineNotifyFailedCount,
    ] = await Promise.all([
      prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: since24h } } }),
      prisma.securityEvent.count({ where: { severity: 'CRITICAL', createdAt: { gte: since7d } } }),
      prisma.deviceSession.count({ where: { isRevoked: false } }),
      prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
      prisma.backupRecord.findFirst({ where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } }),
      prisma.backupRecord.count(),
      isLineOaConfiguredAsync(),
      prisma.user.count({ where: { status: 'ACTIVE', role: { in: ['MANAGER_HR', 'ADMIN'] }, lineUserId: { not: null } } }),
      prisma.attendanceLineNotifyLog.count({ where: { status: 'failed' } }),
    ])

    return NextResponse.json({
      failedLogins24h,
      criticalEvents7d,
      activeSessions,
      lockedAccounts,
      lastBackupAt: recentBackup?.createdAt ?? null,
      totalBackups,
      lineOaConfigured,
      hrLineRecipientCount,
      lineNotifyFailedCount,
    })
  } catch (error) {
    console.error('[security/dashboard GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
