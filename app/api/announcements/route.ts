import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { announcementEmitter } from '@/lib/announcement-events'

const HR_ROLES = ['MANAGER_HR', 'ADMIN']

function toAnnDto(a: {
  id: string; title: string; body: string; type: string; targetType: string
  targetIds: string | null; publishAt: Date; readByIds: string | null
  isArchived: boolean; createdById: string; createdAt: Date
  attachmentName: string | null; attachmentUrl: string | null
  attachmentType: string | null; attachmentPublicId: string | null
}, userId: string) {
  const readByIds: string[] = a.readByIds ? JSON.parse(a.readByIds) : []
  const targetIds: string[] = a.targetIds ? JSON.parse(a.targetIds) : []
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    type: a.type,
    targetType: a.targetType,
    targetIds,
    publishAt: a.publishAt.toISOString(),
    isRead: readByIds.includes(userId),
    readCount: readByIds.length,
    createdById: a.createdById,
    createdAt: a.createdAt.toISOString(),
    isArchived: a.isArchived,
    attachmentName: a.attachmentName ?? null,
    attachmentUrl: a.attachmentUrl ?? null,
    attachmentType: a.attachmentType ?? null,
    attachmentPublicId: a.attachmentPublicId ?? null,
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const archive = searchParams.get('archive') === 'true'
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : null
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : null

    const now = new Date()
    const isHR = HR_ROLES.includes(session.user.role)
    const userId = session.user.id

    const announcements = await prisma.announcement.findMany({
      where: archive && month && year
        ? {
            isArchived: true,
            publishAt: {
              gte: new Date(year, month - 1, 1),
              lte: new Date(year, month, 0, 23, 59, 59),
            },
          }
        : { isArchived: archive, publishAt: { lte: now } },
      orderBy: { publishAt: 'desc' },
      take: 50,
    })

    // Non-HR: filter to only announcements targeted at the user
    let filtered = announcements
    if (!isHR && !archive) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { branchId: true, divisionId: true, departmentId: true, sectionId: true },
      })
      filtered = announcements.filter((a) => {
        if (a.targetType === 'ALL') return true
        const ids: string[] = a.targetIds ? JSON.parse(a.targetIds) : []
        if (ids.length === 0) return a.targetType === 'ALL'
        switch (a.targetType) {
          case 'INDIVIDUAL':   return ids.includes(userId)
          case 'BRANCH':       return !!user?.branchId && ids.includes(user.branchId)
          case 'DIVISION':     return !!user?.divisionId && ids.includes(user.divisionId)
          case 'DEPARTMENT':   return !!user?.departmentId && ids.includes(user.departmentId)
          case 'SECTION':      return !!user?.sectionId && ids.includes(user.sectionId)
          default:             return true
        }
      })
    }

    return NextResponse.json({ announcements: filtered.map((a) => toAnnDto(a, userId)) })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !HR_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json() as {
      title: string; body: string; type?: string
      targetType?: string; targetIds?: string[]
      publishAt?: string
      attachmentName?: string; attachmentUrl?: string
      attachmentType?: string; attachmentPublicId?: string
    }

    if (!body.title?.trim()) return NextResponse.json({ error: 'กรุณาระบุหัวเรื่อง' }, { status: 400 })
    if (!body.body?.trim()) return NextResponse.json({ error: 'กรุณาระบุเนื้อหา' }, { status: 400 })

    const publishAt = body.publishAt ? new Date(body.publishAt) : new Date()
    const targetIds = body.targetIds?.length ? JSON.stringify(body.targetIds) : null

    const ann = await prisma.announcement.create({
      data: {
        title: body.title.trim(),
        body: body.body.trim(),
        type: body.type ?? 'GENERAL',
        targetType: body.targetType ?? 'ALL',
        targetIds,
        publishAt,
        createdById: session.user.id,
        attachmentName: body.attachmentName ?? null,
        attachmentUrl: body.attachmentUrl ?? null,
        attachmentType: body.attachmentType ?? null,
        attachmentPublicId: body.attachmentPublicId ?? null,
      },
    })

    const now = new Date()
    if (publishAt <= now) {
      const userIds = await resolveTargetUserIds(
        body.targetType ?? 'ALL', body.targetIds, session.user.id,
      )
      if (userIds.length > 0) {
        await prisma.notification.createMany({
          data: userIds.map((uid) => ({
            userId: uid,
            type: 'ANNOUNCEMENT' as const,
            title: ann.title,
            message: ann.body.slice(0, 100),
            link: `/announcements`,
          })),
        })
        // Emit notification-count events per user
        for (const uid of userIds) {
          const cnt = await prisma.notification.count({ where: { userId: uid, isRead: false } })
          announcementEmitter.emit('notification-count', { userId: uid, count: cnt })
        }
      }

      // Broadcast new announcement to all SSE clients
      announcementEmitter.emit('new-announcement', toAnnDto(ann, session.user.id))
    }

    return NextResponse.json({ announcement: toAnnDto(ann, session.user.id) })
  } catch (err) {
    return apiError(err)
  }
}

async function resolveTargetUserIds(
  targetType: string,
  targetIds: string[] | undefined,
  creatorId: string,
): Promise<string[]> {
  if (targetType === 'ALL') {
    const users = await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })
    return users.map((u) => u.id)
  }
  if (targetType === 'INDIVIDUAL' && targetIds?.length) return targetIds
  if (targetType === 'BRANCH' && targetIds?.length) {
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE', branchId: { in: targetIds } }, select: { id: true },
    })
    return users.map((u) => u.id)
  }
  if (targetType === 'DIVISION' && targetIds?.length) {
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE', divisionId: { in: targetIds } }, select: { id: true },
    })
    return users.map((u) => u.id)
  }
  if (targetType === 'DEPARTMENT' && targetIds?.length) {
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE', departmentId: { in: targetIds } }, select: { id: true },
    })
    return users.map((u) => u.id)
  }
  if (targetType === 'SECTION' && targetIds?.length) {
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE', sectionId: { in: targetIds } }, select: { id: true },
    })
    return users.map((u) => u.id)
  }
  return []
}
