import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [module_, enrollment] = await Promise.all([
    prisma.trainingModule.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true } },
        questions: { orderBy: { questionOrder: 'asc' } },
        _count:    { select: { enrollments: true } },
      },
    }),
    prisma.trainingEnrollment.findUnique({
      where: { moduleId_userId: { moduleId: id, userId: session.user.id } },
    }),
  ])

  if (!module_) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // For enrolled users — strip correct answers from options
  const questionsForUser = module_.questions.map((q) => {
    const opts = JSON.parse(q.options as string)
    return {
      ...q,
      options: opts.map((o: { text: string; isCorrect: boolean }) => ({ text: o.text })),
    }
  })

  return NextResponse.json({ ...module_, questions: questionsForUser, enrollment })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { title, description, department, contentType, contentUrl, coverUrl,
    targetRoles, estimatedMinutes, passingScore, isRequired, status } = body

  const data: Record<string, unknown> = {}
  if (title       !== undefined) data.title             = title
  if (description !== undefined) data.description       = description
  if (department  !== undefined) data.department        = department
  if (contentType !== undefined) data.contentType       = contentType
  if (contentUrl  !== undefined) data.contentUrl        = contentUrl
  if (coverUrl    !== undefined) data.coverUrl          = coverUrl
  if (targetRoles !== undefined) data.targetRoles       = JSON.stringify(targetRoles)
  if (estimatedMinutes !== undefined) data.estimatedMinutes = estimatedMinutes
  if (passingScore !== undefined) data.passingScore     = passingScore
  if (isRequired  !== undefined) data.isRequired        = isRequired
  if (status      !== undefined) data.status            = status

  const updated = await prisma.trainingModule.update({ where: { id }, data })
  return NextResponse.json(updated)
}
