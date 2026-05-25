import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  })

  return NextResponse.json({ ok: true })
}
