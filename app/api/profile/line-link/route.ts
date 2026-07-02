import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireCsrf } from '@/lib/api-guard'
import { createLineLinkCode, ensureLineLinkTable, unlinkLineUser } from '@/lib/line-link'
import { getLineWebhookUrl, isLineOaConfigured } from '@/lib/line-config'
import { getLineOaBasicId, getLineOaChatUrl, getLineOaChatUrlWithText, normalizeLineOaBasicId } from '@/lib/line-oa-url'

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
      prisma.companySettings.findUnique({
        where: { id: 'singleton' },
        select: { lineChannelId: true },
      }),
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
export async function POST(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

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

    const settings = await prisma.companySettings.findUnique({
      where: { id: 'singleton' },
      select: { lineChannelId: true },
    })
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
export async function DELETE(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

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
