import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { notifyWarningToEmployee } from '@/lib/warnings-notify'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ส่งใบเตือน' }, { status: 403 })
    }

    const { id } = await params
    const warning = await prisma.warning.findUnique({
      where: { id },
      select: { id: true, userId: true, createdAt: true },
    })
    if (!warning) return NextResponse.json({ error: 'ไม่พบใบเตือน' }, { status: 404 })

    const warningNumber = await prisma.warning.count({
      where: {
        userId: warning.userId,
        createdAt: { lte: warning.createdAt },
      },
    })

    const result = await notifyWarningToEmployee(id, { warningNumber })

    return NextResponse.json({ success: true, fileLink: result?.fileLink ?? null })
  } catch (err) {
    return apiError(err)
  }
}
