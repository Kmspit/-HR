import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: moduleId } = await params

  const module_ = await prisma.trainingModule.findUnique({ where: { id: moduleId } })
  if (!module_) return NextResponse.json({ error: 'Module not found' }, { status: 404 })

  const existing = await prisma.trainingEnrollment.findUnique({
    where: { moduleId_userId: { moduleId, userId: session.user.id } },
  })
  if (existing) return NextResponse.json(existing)

  const enrollment = await prisma.trainingEnrollment.create({
    data: {
      moduleId,
      userId:    session.user.id,
      status:   'NOT_STARTED',
      startedAt: new Date(),
    },
  })

  return NextResponse.json(enrollment, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
