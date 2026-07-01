import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'
import { broadcastNotificationUpdate } from '@/lib/notification-center/broadcast'

export async function POST() {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    })

    await broadcastNotificationUpdate(session.user.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
