import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const rules = await prisma.companyRule.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
  })
  return NextResponse.json({ rules })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { title, content, fileUrl, category, version } = body

  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const rule = await prisma.companyRule.create({
    data: { title, content, fileUrl, category: category ?? 'general', version, createdById: session.user.id },
  })

  return NextResponse.json({ rule })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, ...data } = body

  const rule = await prisma.companyRule.update({ where: { id }, data })
  return NextResponse.json({ rule })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.companyRule.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
