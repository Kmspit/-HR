import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: moduleId } = await params
  const body = await req.json()
  const { timeSpentMinutes, answers } = body

  const module_ = await prisma.trainingModule.findUnique({
    where: { id: moduleId },
    include: { questions: true },
  })
  if (!module_) return NextResponse.json({ error: 'Module not found' }, { status: 404 })

  // Ensure enrolled
  const enrollment = await prisma.trainingEnrollment.upsert({
    where:  { moduleId_userId: { moduleId, userId: session.user.id } },
    create: { moduleId, userId: session.user.id, status: 'IN_PROGRESS', startedAt: new Date() },
    update: { status: 'IN_PROGRESS' },
  })

  // If answers provided — grade quiz
  if (Array.isArray(answers) && answers.length > 0 && module_.questions.length > 0) {
    let correct = 0
    for (const ans of answers) {
      const question = module_.questions.find((q) => q.id === ans.questionId)
      if (!question) continue
      const opts = JSON.parse(question.options as string) as { text: string; isCorrect: boolean }[]
      const chosen = opts[ans.selectedIndex]
      if (chosen?.isCorrect) correct++
    }
    const score  = Math.round((correct / module_.questions.length) * 100)
    const passed = score >= module_.passingScore

    const attemptNumber = (await prisma.quizAttempt.count({
      where: { moduleId, userId: session.user.id },
    })) + 1

    await prisma.quizAttempt.create({
      data: {
        moduleId,
        userId:  session.user.id,
        answers: JSON.stringify(answers),
        score,
        passed,
        attempt: attemptNumber,
      },
    })

    const updatedEnrollment = await prisma.trainingEnrollment.update({
      where: { id: enrollment.id },
      data:  {
        score,
        status:          passed ? 'COMPLETED' : 'FAILED',
        completedAt:     passed ? new Date() : null,
        timeSpentMinutes: { increment: timeSpentMinutes ?? 0 },
      },
    })

    return NextResponse.json({ ...updatedEnrollment, score, passed, correct, total: module_.questions.length })
  }

  // Progress-only update (no quiz submission)
  const updated = await prisma.trainingEnrollment.update({
    where: { id: enrollment.id },
    data:  {
      status:          'IN_PROGRESS',
      timeSpentMinutes: { increment: timeSpentMinutes ?? 0 },
    },
  })

  return NextResponse.json(updated)
} catch (err) {
  return apiError(err)
 }
}
