import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { createNotification, sendLineMessage } from '@/lib/notifications'

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
      include: { user: { select: { name: true, lineId: true } } },
    })
    if (!warning) return NextResponse.json({ error: 'ไม่พบใบเตือน' }, { status: 404 })

    const base = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')
    const fileLink = warning.fileUrl
      ? warning.fileUrl.startsWith('http')
        ? warning.fileUrl
        : `${base}${warning.fileUrl}`
      : null

    const title = `ใบเตือนระดับ ${warning.level}`
    const message = fileLink
      ? `${warning.reason}\n\n📎 ไฟล์ใบเตือน: ${fileLink}`
      : `${warning.reason}\n\nดูรายละเอียดในเมนูใบเตือน`

    await createNotification({
      userId: warning.userId,
      type: 'WARNING_ISSUED',
      title,
      message,
      link: '/warnings',
    })

    const lineText = fileLink
      ? `📄 ใบเตือน — ${warning.user.name}\n${warning.reason}\n\nดาวน์โหลดไฟล์:\n${fileLink}`
      : `⚠️ ใบเตือน — ${warning.user.name}\n${warning.reason}\n\nกรุณาเปิดแอพ HRFlow → เมนูใบเตือน`

    await sendLineMessage(warning.userId, lineText)

    await prisma.warning.update({
      where: { id },
      data: { sentToLine: true },
    })

    return NextResponse.json({ success: true, fileLink })
  } catch (err) {
    return apiError(err)
  }
}
