import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    totalArticles,
    publishedArticles,
    totalSops,
    approvedSops,
    totalModules,
    publishedModules,
    completedEnrollments,
    totalEnrollments,
    topArticles,
    byCategory,
    byDept,
    recentModules,
    failedEnrollments,
  ] = await Promise.all([
    prisma.knowledgeArticle.count(),
    prisma.knowledgeArticle.count({ where: { status: 'PUBLISHED' } }),
    prisma.sopDocument.count(),
    prisma.sopDocument.count({ where: { status: 'APPROVED' } }),
    prisma.trainingModule.count(),
    prisma.trainingModule.count({ where: { status: 'PUBLISHED' } }),
    prisma.trainingEnrollment.count({ where: { status: 'COMPLETED' } }),
    prisma.trainingEnrollment.count(),
    prisma.knowledgeArticle.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { viewCount: 'desc' },
      select: { id: true, title: true, category: true, viewCount: true },
      take: 10,
    }),
    prisma.knowledgeArticle.groupBy({
      by: ['category'],
      _count: { id: true },
    }),
    prisma.sopDocument.groupBy({
      by: ['department'],
      _count: { id: true },
    }),
    prisma.trainingModule.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, isRequired: true, estimatedMinutes: true,
        _count: { select: { enrollments: true } },
      },
      take: 8,
    }),
    prisma.trainingEnrollment.count({ where: { status: 'FAILED' } }),
  ])

  const completionRate = totalEnrollments > 0
    ? Math.round((completedEnrollments / totalEnrollments) * 100)
    : 0

  return NextResponse.json({
    totalArticles,
    publishedArticles,
    totalSops,
    approvedSops,
    totalModules,
    publishedModules,
    completedEnrollments,
    totalEnrollments,
    completionRate,
    failedEnrollments,
    topArticles,
    byCategory: byCategory.map((c) => ({ category: c.category, count: c._count.id })),
    byDept:     byDept.map((d) => ({ department: d.department, count: d._count.id })),
    recentModules,
  })
}
