import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'

export async function GET() {
 try {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalRules,
    activeRules,
    totalLogs,
    successLogs,
    failLogs,
    recentLogs,
    topRules,
    failedRules,
    avgDuration,
  ] = await Promise.all([
    prisma.automationRule.count(),
    prisma.automationRule.count({ where: { isActive: true } }),
    prisma.automationExecutionLog.count(),
    prisma.automationExecutionLog.count({ where: { success: true } }),
    prisma.automationExecutionLog.count({ where: { success: false } }),
    prisma.automationExecutionLog.count({ where: { triggeredAt: { gte: thirtyDaysAgo } } }),
    prisma.automationRule.findMany({
      where: { runCount: { gt: 0 } },
      select: { id: true, name: true, trigger: true, runCount: true, successCount: true, failCount: true, lastRunAt: true },
      orderBy: { runCount: 'desc' },
      take: 5,
    }),
    prisma.automationRule.findMany({
      where: { failCount: { gt: 0 } },
      select: { id: true, name: true, trigger: true, failCount: true, runCount: true },
      orderBy: { failCount: 'desc' },
      take: 5,
    }),
    prisma.automationExecutionLog.aggregate({
      _avg: { durationMs: true },
      where: { durationMs: { not: null } },
    }),
  ])

  const successRate = totalLogs > 0 ? Math.round((successLogs / totalLogs) * 100) : 0

  const taskActionsCreated = await prisma.automationExecutionLog.count({
    where: { actionsRun: { contains: 'CREATE_TASK' }, success: true },
  })

  const notificationsSent = await prisma.automationExecutionLog.count({
    where: { actionsRun: { contains: 'SEND_NOTIFICATION' }, success: true },
  })

  return NextResponse.json({
    totalRules,
    activeRules,
    totalExecutions: totalLogs,
    successExecutions: successLogs,
    failExecutions: failLogs,
    recentExecutions: recentLogs,
    successRate,
    avgDurationMs: Math.round(avgDuration._avg.durationMs ?? 0),
    topRules,
    failedRules,
    manualWorkReduced: {
      tasksAutoCreated:     taskActionsCreated,
      notificationsAutoSent: notificationsSent,
      estimatedMinutesSaved: taskActionsCreated * 5 + notificationsSent * 2,
    },
  })
} catch (err) {
  return apiError(err)
 }
}
