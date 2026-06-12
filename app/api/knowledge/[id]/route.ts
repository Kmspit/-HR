import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const EDITOR_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const article = await prisma.knowledgeArticle.findUnique({
    where: { id },
    include: {
      createdBy:  { select: { name: true, role: true } },
      approvedBy: { select: { name: true } },
    },
  })
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Increment view count (fire-and-forget)
  prisma.knowledgeArticle.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {})

  return NextResponse.json(article)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!EDITOR_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { title, content, category, department, tags, status } = body

  const data: Record<string, unknown> = {}
  if (title)      data.title      = title
  if (content)    data.content    = content
  if (category)   data.category   = category
  if (department !== undefined) data.department = department
  if (tags !== undefined)       data.tags       = tags
  if (status) {
    data.status = status
    if (status === 'PUBLISHED') {
      data.approvedById = session.user.id
      data.approvedAt   = new Date()
    }
  }

  const updated = await prisma.knowledgeArticle.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'CEO', 'MANAGER_HR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await prisma.knowledgeArticle.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
