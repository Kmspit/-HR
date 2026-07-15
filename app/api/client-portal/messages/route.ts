import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { createNotification } from '@/lib/notifications'
import { requireActivePortalSession } from '@/lib/portal-session-guard'
import { apiError } from '@/lib/api-handler'
import {
  isStaffMessageRole,
  resolveClientUserIdForPortal,
  staffCanAccessClientMessages,
} from '@/lib/client-message-access'

export async function GET(req: NextRequest) {
 try {
  const portal = await requireActivePortalSession(req)
  if (portal.ok) {
    const clientUserId = await resolveClientUserIdForPortal(
      portal.session.email,
      portal.session.clientCompanyId,
    )
    if (!clientUserId) return NextResponse.json([])

    const taskId = req.nextUrl.searchParams.get('taskId')
    const messages = await prisma.clientMessage.findMany({
      where: { clientId: clientUserId, ...(taskId ? { taskId } : {}) },
      orderBy: { createdAt: 'asc' },
    })
    await prisma.clientMessage.updateMany({
      where: { clientId: clientUserId, isFromClient: false, readAt: null },
      data: { readAt: new Date() },
    })
    return NextResponse.json(messages)
  }

  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const taskId = searchParams.get('taskId')
  const clientId = searchParams.get('clientId')

  if (session.user.role === 'CLIENT') {
    const messages = await prisma.clientMessage.findMany({
      where: { clientId: session.user.id, ...(taskId ? { taskId } : {}) },
      orderBy: { createdAt: 'asc' },
    })
    await prisma.clientMessage.updateMany({
      where: { clientId: session.user.id, isFromClient: false, readAt: null },
      data: { readAt: new Date() },
    })
    return NextResponse.json(messages)
  }

  if (isStaffMessageRole(session.user.role) && clientId) {
    const allowed = await staffCanAccessClientMessages(
      session.user.id,
      session.user.role,
      clientId,
      taskId,
    )
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const messages = await prisma.clientMessage.findMany({
      where: { clientId, ...(taskId ? { taskId } : {}) },
      orderBy: { createdAt: 'asc' },
    })
    await prisma.clientMessage.updateMany({
      where: { clientId, isFromClient: true, readAt: null },
      data: { readAt: new Date() },
    })
    return NextResponse.json(messages)
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
} catch (err) {
  return apiError(err)
 }
}

export async function POST(req: NextRequest) {
 try {
  const body = await req.json()
  const { content, taskId, clientId: targetClientId } = body

  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 })

  const portal = await requireActivePortalSession(req)
  if (portal.ok) {
    const clientUserId = await resolveClientUserIdForPortal(
      portal.session.email,
      portal.session.clientCompanyId,
    )
    if (!clientUserId) {
      return NextResponse.json({ error: 'ไม่พบบัญชีลูกค้าในระบบ' }, { status: 403 })
    }

    // Verify the task actually belongs to this client BEFORE creating the
    // message row — previously this was only checked before notifying staff,
    // so a taskId for a different company's case still got persisted on the
    // message (no notification fired, but the row existed regardless).
    let task: { assigneeId: string; assignedById: string; title: string; clientId: string | null } | null = null
    if (taskId) {
      task = await prisma.taskAssignment.findUnique({
        where: { id: taskId },
        select: { assigneeId: true, assignedById: true, title: true, clientId: true },
      })
      if (!task || task.clientId !== clientUserId) {
        return NextResponse.json({ error: 'ไม่พบงานนี้ในบัญชีของคุณ' }, { status: 403 })
      }
    }

    const msg = await prisma.clientMessage.create({
      data: {
        clientId: clientUserId,
        taskId: taskId ?? null,
        senderId: clientUserId,
        senderName: portal.session.fullName ?? 'ลูกค้า',
        isFromClient: true,
        content: content.trim(),
      },
    })

    if (task) {
      for (const staffId of [task.assigneeId, task.assignedById]) {
        await createNotification({
          userId: staffId,
          type: 'SYSTEM',
          title: 'ข้อความจากลูกค้า',
          message: `ลูกค้าส่งข้อความในคดี "${task.title}"`,
          link: `/clients/${clientUserId}`,
        })
      }
    }

    return NextResponse.json(msg, { status: 201 })
  }

  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.user.role === 'CLIENT') {
    const msg = await prisma.clientMessage.create({
      data: {
        clientId: session.user.id,
        taskId: taskId ?? null,
        senderId: session.user.id,
        senderName: session.user.name ?? 'ลูกค้า',
        isFromClient: true,
        content: content.trim(),
      },
    })

    if (taskId) {
      const task = await prisma.taskAssignment.findUnique({
        where: { id: taskId },
        select: { assigneeId: true, assignedById: true, title: true },
      })
      if (task) {
        for (const staffId of [task.assigneeId, task.assignedById]) {
          await createNotification({
            userId: staffId,
            type: 'SYSTEM',
            title: 'ข้อความจากลูกค้า',
            message: `ลูกค้าส่งข้อความในคดี "${task.title}"`,
            link: `/clients/${session.user.id}`,
          })
        }
      }
    }

    return NextResponse.json(msg, { status: 201 })
  }

  if (isStaffMessageRole(session.user.role) && targetClientId) {
    const allowed = await staffCanAccessClientMessages(
      session.user.id,
      session.user.role,
      targetClientId,
      taskId,
    )
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const msg = await prisma.clientMessage.create({
      data: {
        clientId: targetClientId,
        taskId: taskId ?? null,
        senderId: session.user.id,
        senderName: session.user.name ?? 'เจ้าหน้าที่',
        isFromClient: false,
        content: content.trim(),
      },
    })

    await createNotification({
      userId: targetClientId,
      type: 'SYSTEM',
      title: 'ข้อความจากเจ้าหน้าที่',
      message: 'เจ้าหน้าที่ตอบกลับข้อความของคุณ',
      link: '/client-portal/messages',
    })

    return NextResponse.json(msg, { status: 201 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
} catch (err) {
  return apiError(err)
 }
}
