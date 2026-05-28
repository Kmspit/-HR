import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { createLineLinkCode, ensureLineLinkTable, unlinkLineUser } from '@/lib/line-link'
import { getLineWebhookUrl, isLineOaConfigured } from '@/lib/line-config'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { lineUserId: true, lineDisplayName: true, lineId: true },
    })
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      configured: isLineOaConfigured(),
      webhookUrl: getLineWebhookUrl(),
      linked: !!user.lineUserId,
      lineUserId: user.lineUserId,
      lineDisplayName: user.lineDisplayName,
      lineId: user.lineId,
    })
  } catch (err) {
    return apiError(err)
  }
}

/** สร้างรหัสเชื่อม LINE (อายุ 15 นาที) */
export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isLineOaConfigured()) {
      return NextResponse.json(
        { error: 'ระบบยังไม่ได้ตั้งค่า LINE OA บนเซิร์ฟเวอร์' },
        { status: 503 },
      )
    }

    const { code, expiresAt } = await createLineLinkCode(session.user.id)

    return NextResponse.json({
      code,
      expiresAt: expiresAt.toISOString(),
      command: `ลิงก์ ${code}`,
      webhookUrl: getLineWebhookUrl(),
    })
  } catch (err) {
    return apiError(err)
  }
}

/** ยกเลิกการผูก LINE (จากแอป) */
export async function DELETE() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { lineUserId: null, lineDisplayName: null },
    })

    await ensureLineLinkTable()
    await prisma.$executeRaw`DELETE FROM line_link_codes WHERE userId = ${session.user.id}`

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
