import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { apiError } from '@/lib/api-handler'

const EDITOR_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\sก-๙]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) + '-' + Date.now().toString(36)
}

export async function GET(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp         = req.nextUrl.searchParams
  const q          = sp.get('q')          ?? undefined
  const category   = sp.get('category')   ?? undefined
  const department = sp.get('department') ?? undefined
  const status     = sp.get('status')     ?? 'PUBLISHED'
  const page       = Math.max(1, Number(sp.get('page') ?? '1'))
  const take       = 50

  const where: Record<string, unknown> = {}
  if (status !== 'ALL') where.status = status
  if (category)         where.category = category
  if (department)       where.department = department
  if (q) {
    where.OR = [
      { title:   { contains: q } },
      { content: { contains: q } },
      { tags:    { contains: q } },
    ]
  }

  const [total, items] = await Promise.all([
    prisma.knowledgeArticle.count({ where }),
    prisma.knowledgeArticle.findMany({
      where,
      select: {
        id: true, title: true, slug: true, category: true,
        department: true, tags: true, status: true, viewCount: true,
        createdAt: true, updatedAt: true,
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
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
  const { title, content, category, department, tags, status } = body
  if (!title || !content) {
    return NextResponse.json({ error: 'title and content are required' }, { status: 400 })
  }

  const article = await prisma.knowledgeArticle.create({
    data: {
      title,
      slug:        slugify(title),
      content,
      category:    category   ?? 'GENERAL',
      department:  department ?? null,
      tags:        tags       ?? null,
      status:      status     ?? 'DRAFT',
      createdById: session.user.id,
    },
  })

  if (article.status === 'PUBLISHED') {
    await prisma.notification.createMany({
      data: (await prisma.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
        take: 200,
      })).map((u) => ({
        userId:  u.id,
        type:    'KNOWLEDGE_PUBLISHED' as const,
        title:   `📖 บทความใหม่: ${title}`,
        message: category ?? 'ความรู้ทั่วไป',
        link:    '/knowledge',
      })),
    })
  }

  return NextResponse.json(article, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
