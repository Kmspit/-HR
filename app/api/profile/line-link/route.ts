import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { createLineLinkCode, ensureLineLinkTable, unlinkLineUser } from '@/lib/line-link'
import { getLineWebhookUrl, isLineOaConfigured } from '@/lib/line-config'
import { getLineOaBasicId, getLineOaChatUrl, getLineOaChatUrlWithText, normalizeLineOaBasicId } from '@/lib/line-oa-url'
import { getCachedCompanySettings } from '@/lib/company-settings-cache'

function resolveLineOaBasicId(lineChannelId: string | null | undefined): string {
  return normalizeLineOaBasicId(lineChannelId) ?? getLineOaBasicId()
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [user, settings] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { lineUserId: true, lineDisplayName: true, lineId: true },
      }),
      getCachedCompanySettings(),
    ])
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const lineOaBasicId = resolveLineOaBasicId(settings?.lineChannelId)

    return NextResponse.json({
      configured: isLineOaConfigured(),
      webhookUrl: getLineWebhookUrl(),
      lineOaBasicId,
      lineOaUrl: getLineOaChatUrl(lineOaBasicId),
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
export async function POST(_req: NextRequest) {
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
    const command = `ลิงก์ ${code}`

    const settings = await getCachedCompanySettings()
    const lineOaBasicId = resolveLineOaBasicId(settings?.lineChannelId)

    return NextResponse.json({
      code,
      expiresAt: expiresAt.toISOString(),
      command,
      lineOaBasicId,
      lineOaUrl: getLineOaChatUrl(lineOaBasicId),
      lineOaUrlWithMessage: getLineOaChatUrlWithText(command, lineOaBasicId),
      webhookUrl: getLineWebhookUrl(),
    })
  } catch (err) {
    return apiError(err)
  }
}

/** ยกเลิกการผูก LINE (จากแอป) */
export async function DELETE(_req: NextRequest) {
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
