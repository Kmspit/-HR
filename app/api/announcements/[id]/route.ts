import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

const HR_ROLES = ['MANAGER_HR', 'ADMIN']

type Context = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await req.json() as Record<string, unknown>

    // Mark as read for the current user
    if (body.markRead === true) {
      const ann = await prisma.announcement.findUnique({ where: { id }, select: { readByIds: true } })
      if (!ann) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const readByIds: string[] = ann.readByIds ? JSON.parse(ann.readByIds) : []
      if (!readByIds.includes(session.user.id)) {
        readByIds.push(session.user.id)
        await prisma.announcement.update({
          where: { id },
          data: { readByIds: JSON.stringify(readByIds) },
        })
      }
      return NextResponse.json({ success: true })
    }

    // HR update announcement
    if (!HR_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data: Record<string, unknown> = {}
    if (typeof body.title === 'string') data.title = body.title.trim()
    if (typeof body.body === 'string') data.body = body.body.trim()
    if (typeof body.type === 'string') data.type = body.type
    if (typeof body.targetType === 'string') data.targetType = body.targetType
    if (typeof body.isArchived === 'boolean') data.isArchived = body.isArchived
    if (body.publishAt) data.publishAt = new Date(body.publishAt as string)

    const ann = await prisma.announcement.update({ where: { id }, data })
    return NextResponse.json({ announcement: ann })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const session = await auth()
    if (!session?.user?.id || !HR_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    await prisma.announcement.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
