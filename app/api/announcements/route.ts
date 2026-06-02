import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { createNotification } from '@/lib/notifications'

const HR_ROLES = ['MANAGER_HR', 'ADMIN']

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const archive = searchParams.get('archive') === 'true'
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : null
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : null

    const now = new Date()

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

    const userId = session.user.id
    const result = announcements.map((a) => {
      const readByIds: string[] = a.readByIds ? JSON.parse(a.readByIds) : []
      return {
        id: a.id,
        title: a.title,
        body: a.body,
        type: a.type,
        targetType: a.targetType,
        publishAt: a.publishAt.toISOString(),
        isRead: readByIds.includes(userId),
        readCount: readByIds.length,
        createdById: a.createdById,
        createdAt: a.createdAt.toISOString(),
        isArchived: a.isArchived,
      }
    })

    return NextResponse.json({ announcements: result })
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
      title: string
      body: string
      type?: string
      targetType?: string
      targetIds?: string[]
      publishAt?: string
    }

    if (!body.title?.trim()) return NextResponse.json({ error: 'กรุณาระบุหัวเรื่อง' }, { status: 400 })
    if (!body.body?.trim()) return NextResponse.json({ error: 'กรุณาระบุเนื้อหา' }, { status: 400 })

    const publishAt = body.publishAt ? new Date(body.publishAt) : new Date()
    const targetIds = body.targetIds ? JSON.stringify(body.targetIds) : null

    const ann = await prisma.announcement.create({
      data: {
        title: body.title.trim(),
        body: body.body.trim(),
        type: body.type ?? 'GENERAL',
        targetType: body.targetType ?? 'ALL',
        targetIds,
        publishAt,
        createdById: session.user.id,
      },
    })

    // Send notifications to target users
    const now = new Date()
    if (publishAt <= now) {
      await sendAnnouncementNotifications(ann.id, body.title, body.body, body.targetType ?? 'ALL', body.targetIds, body.type)
    }

    return NextResponse.json({ announcement: ann })
  } catch (err) {
    return apiError(err)
  }
}

async function sendAnnouncementNotifications(
  annId: string,
  title: string,
  body: string,
  targetType: string,
  targetIds: string[] | undefined,
  type?: string,
) {
  let userIds: string[] = []

  if (targetType === 'ALL') {
    const users = await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })
    userIds = users.map((u) => u.id)
  } else if (targetType === 'INDIVIDUAL' && targetIds?.length) {
    userIds = targetIds
  } else if (targetType === 'DEPARTMENT' && targetIds?.length) {
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE', departmentId: { in: targetIds } },
      select: { id: true },
    })
    userIds = users.map((u) => u.id)
  } else if (targetType === 'BRANCH' && targetIds?.length) {
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE', branchId: { in: targetIds } },
      select: { id: true },
    })
    userIds = users.map((u) => u.id)
  }

  if (userIds.length === 0) return

  await prisma.notification.createMany({
    data: userIds.map((uid) => ({
      userId: uid,
      type: 'ANNOUNCEMENT' as const,
      title,
      message: body.slice(0, 100),
      link: `/announcements`,
    })),
  })
}
