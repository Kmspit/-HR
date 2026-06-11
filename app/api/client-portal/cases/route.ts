import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const q      = searchParams.get('q')?.trim()
  const status = searchParams.get('status')

  const clientId = session.user.id

  const where: Record<string, unknown> = { clientId }
  if (status) where.status = status
  if (q) {
    where.OR = [
      { title:      { contains: q } },
      { caseNumber: { contains: q } },
      { clientName: { contains: q } },
    ]
  }

  const tasks = await prisma.taskAssignment.findMany({
    where,
    include: {
      assignee:   { select: { id: true, name: true, position: true } },
      assignedBy: { select: { id: true, name: true } },
      attachments: { select: { id: true, fileName: true, fileUrl: true, fileType: true }, take: 3 },
      statusHistories: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  // Summary stats
  const total    = tasks.length
  const active   = tasks.filter((t) => !['COMPLETED', 'OVERDUE'].includes(t.status)).length
  const completed= tasks.filter((t) => t.status === 'COMPLETED').length
  const upcoming = tasks.filter((t) => {
    if (!t.courtDate) return false
    const d = new Date(t.courtDate)
    const now = new Date()
    const in30 = new Date(now.getTime() + 30 * 86400_000)
    return d >= now && d <= in30
  }).length

  return NextResponse.json({ tasks, summary: { total, active, completed, upcoming } })
}
