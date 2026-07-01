import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { announcementEmitter } from '@/lib/announcement-events'
import { ANNOUNCEMENT_UPLOADER_ROLES } from '@/lib/access-control'

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
    if (!ANNOUNCEMENT_UPLOADER_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data: Record<string, unknown> = {}
    if (typeof body.title === 'string') data.title = body.title.trim()
    if (typeof body.body === 'string') data.body = body.body.trim()
    if (typeof body.type === 'string') data.type = body.type
    if (typeof body.targetType === 'string') data.targetType = body.targetType
    if (Array.isArray(body.targetIds)) data.targetIds = JSON.stringify(body.targetIds)
    if (typeof body.isArchived === 'boolean') data.isArchived = body.isArchived
    if (body.publishAt) data.publishAt = new Date(body.publishAt as string)
    // Attachment fields
    if ('attachmentName' in body) data.attachmentName = body.attachmentName ?? null
    if ('attachmentUrl' in body) data.attachmentUrl = body.attachmentUrl ?? null
    if ('attachmentType' in body) data.attachmentType = body.attachmentType ?? null
    if ('attachmentPublicId' in body) data.attachmentPublicId = body.attachmentPublicId ?? null

    const ann = await prisma.announcement.update({ where: { id }, data })

    // Broadcast update to all SSE clients
    const readByIds: string[] = ann.readByIds ? JSON.parse(ann.readByIds as string) : []
    const targetIds: string[] = ann.targetIds ? JSON.parse(ann.targetIds as string) : []
    announcementEmitter.emit('new-announcement', {
      id: ann.id, title: ann.title, body: ann.body, type: ann.type,
      targetType: ann.targetType, targetIds,
      publishAt: ann.publishAt.toISOString(),
      isRead: false, readCount: readByIds.length,
      createdById: ann.createdById,
      createdAt: ann.createdAt.toISOString(),
      isArchived: ann.isArchived,
      attachmentName: ann.attachmentName ?? null,
      attachmentUrl: ann.attachmentUrl ?? null,
      attachmentType: ann.attachmentType ?? null,
      attachmentPublicId: ann.attachmentPublicId ?? null,
      _updated: true,
    })

    return NextResponse.json({ announcement: ann })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const session = await auth()
    if (!session?.user?.id || !ANNOUNCEMENT_UPLOADER_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    await prisma.announcement.delete({ where: { id } })

    // Notify clients to remove this announcement
    announcementEmitter.emit('new-announcement', { id, _deleted: true })

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
