import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

export async function GET(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q') ?? ''
  if (q.trim().length < 2) {
    return NextResponse.json({ articles: [], sops: [], modules: [] })
  }

  const [articles, sops, modules] = await Promise.all([
    prisma.knowledgeArticle.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [
          { title:   { contains: q } },
          { content: { contains: q } },
          { tags:    { contains: q } },
        ],
      },
      select: { id: true, title: true, category: true, department: true, slug: true },
      take: 10,
    }),
    prisma.sopDocument.findMany({
      where: {
        status: 'APPROVED',
        OR: [
          { title:       { contains: q } },
          { description: { contains: q } },
          { steps:       { contains: q } },
        ],
      },
      select: { id: true, sopCode: true, title: true, department: true },
      take: 10,
    }),
    prisma.trainingModule.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [
          { title:       { contains: q } },
          { description: { contains: q } },
        ],
      },
      select: { id: true, title: true, contentType: true, department: true },
      take: 10,
    }),
  ])

  return NextResponse.json({ articles, sops, modules })
} catch (err) {
  return apiError(err)
 }
}
