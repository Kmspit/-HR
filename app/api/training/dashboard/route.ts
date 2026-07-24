import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

export async function GET() {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    totalModules,
    publishedModules,
    completedEnrollments,
    totalEnrollments,
    recentModules,
    failedEnrollments,
  ] = await Promise.all([
    prisma.trainingModule.count(),
    prisma.trainingModule.count({ where: { status: 'PUBLISHED' } }),
    prisma.trainingEnrollment.count({ where: { status: 'COMPLETED' } }),
    prisma.trainingEnrollment.count(),
    prisma.trainingModule.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, isRequired: true, estimatedMinutes: true,
        _count: { select: { enrollments: true } },
      },
      take: 8,
    }),
    prisma.trainingEnrollment.findMany({
      where: { status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
      select: {
        score: true,
        module: { select: { title: true } },
        user: { select: { name: true } },
      },
      take: 20,
    }),
  ])

  const completionRate = totalEnrollments > 0
    ? Math.round((completedEnrollments / totalEnrollments) * 100)
    : 0

  return NextResponse.json({
    totalModules,
    publishedModules,
    completedEnrollments,
    totalEnrollments,
    completionRate,
    failedEnrollments,
    recentModules,
  })
} catch (err) {
  return apiError(err)
 }
}
