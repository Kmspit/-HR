import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

const EDITOR_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp         = req.nextUrl.searchParams
  const status     = sp.get('status')     ?? 'PUBLISHED'
  const department = sp.get('department') ?? undefined
  const q          = sp.get('q')          ?? undefined
  const myProgress = sp.get('myProgress') === 'true'
  const page       = Math.max(1, Number(sp.get('page') ?? '1'))
  const take       = 50

  const where: Record<string, unknown> = {}
  if (status !== 'ALL') where.status = status
  if (department)       where.department = department
  if (q) {
    where.OR = [
      { title:       { contains: q } },
      { description: { contains: q } },
    ]
  }

  const [total, items] = await Promise.all([
    prisma.trainingModule.count({ where }),
    prisma.trainingModule.findMany({
      where,
      include: {
        createdBy: { select: { name: true } },
        _count:    { select: { enrollments: true, questions: true } },
        ...(myProgress ? {
          enrollments: {
            where: { userId: session.user.id },
            select: { status: true, score: true, completedAt: true },
          },
        } : {}),
      },
      orderBy: [{ isRequired: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * take,
      take,
    }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / take) })
} catch (err) {
  return apiError(err)
 }
}

export async function POST(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!EDITOR_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, department, contentType, contentUrl, coverUrl,
    targetRoles, estimatedMinutes, passingScore, isRequired, status, questions } = body

  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const module_ = await prisma.trainingModule.create({
    data: {
      title,
      description:      description     ?? null,
      department:       department      ?? null,
      contentType:      contentType     ?? 'DOCUMENT',
      contentUrl:       contentUrl      ?? null,
      coverUrl:         coverUrl        ?? null,
      targetRoles:      targetRoles     ? JSON.stringify(targetRoles) : '[]',
      estimatedMinutes: estimatedMinutes ?? 30,
      passingScore:     passingScore    ?? 70,
      isRequired:       isRequired      ?? false,
      status:           status          ?? 'DRAFT',
      createdById:      session.user.id,
    },
  })

  // Create quiz questions if provided
  if (Array.isArray(questions) && questions.length > 0) {
    await prisma.quizQuestion.createMany({
      data: questions.map((q: { question: string; options: unknown[]; questionOrder?: number }, i: number) => ({
        moduleId:      module_.id,
        question:      q.question,
        options:       JSON.stringify(q.options),
        questionOrder: q.questionOrder ?? i,
      })),
    })
  }

  return NextResponse.json(module_, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
