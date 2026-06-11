import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { createNotification } from '@/lib/notifications'

const STAFF_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER', 'EMPLOYEE', 'LAWYER', 'ENFORCEMENT']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const taskId   = searchParams.get('taskId')
  const clientId = searchParams.get('clientId') // for staff querying a client's messages

  if (session.user.role === 'CLIENT') {
    // Client sees their own messages
    const messages = await prisma.clientMessage.findMany({
      where: { clientId: session.user.id, ...(taskId ? { taskId } : {}) },
      orderBy: { createdAt: 'asc' },
    })
    // Mark staff replies as read
    await prisma.clientMessage.updateMany({
      where: { clientId: session.user.id, isFromClient: false, readAt: null },
      data:  { readAt: new Date() },
    })
    return NextResponse.json(messages)
  }

  if (STAFF_ROLES.includes(session.user.role) && clientId) {
    const messages = await prisma.clientMessage.findMany({
      where: { clientId, ...(taskId ? { taskId } : {}) },
      orderBy: { createdAt: 'asc' },
    })
    // Mark client messages as read
    await prisma.clientMessage.updateMany({
      where: { clientId, isFromClient: true, readAt: null },
      data:  { readAt: new Date() },
    })
    return NextResponse.json(messages)
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { content, taskId, clientId: targetClientId } = body

  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 })

  if (session.user.role === 'CLIENT') {
    // Client sends a message
    const msg = await prisma.clientMessage.create({
      data: {
        clientId:    session.user.id,
        taskId:      taskId ?? null,
        senderId:    session.user.id,
        senderName:  session.user.name ?? 'ลูกค้า',
        isFromClient: true,
        content:     content.trim(),
      },
    })

    // Find assigned staff and notify them
    if (taskId) {
      const task = await prisma.taskAssignment.findUnique({
        where: { id: taskId },
        select: { assigneeId: true, assignedById: true, title: true },
      })
      if (task) {
        for (const staffId of [task.assigneeId, task.assignedById]) {
          await createNotification({
            userId:  staffId,
            type:    'SYSTEM',
            title:   'ข้อความจากลูกค้า',
            message: `ลูกค้าส่งข้อความในคดี "${task.title}"`,
            link:    `/clients/${session.user.id}`,
          })
        }
      }
    }

    return NextResponse.json(msg, { status: 201 })
  }

  if (STAFF_ROLES.includes(session.user.role) && targetClientId) {
    // Staff replies to client
    const msg = await prisma.clientMessage.create({
      data: {
        clientId:     targetClientId,
        taskId:       taskId ?? null,
        senderId:     session.user.id,
        senderName:   session.user.name ?? 'เจ้าหน้าที่',
        isFromClient: false,
        content:      content.trim(),
      },
    })

    await createNotification({
      userId:  targetClientId,
      type:    'SYSTEM',
      title:   'ข้อความจากเจ้าหน้าที่',
      message: `เจ้าหน้าที่ตอบกลับข้อความของคุณ`,
      link:    `/client-portal/messages`,
    })

    return NextResponse.json(msg, { status: 201 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
