import { prisma } from '@/lib/prisma'
import { createNotification, sendLineMessage } from '@/lib/notifications'
import { warningPdfPublicUrl } from '@/lib/warning-pdf-url'

export async function notifyWarningToEmployee(
  warningId: string,
  options?: { warningNumber?: number },
) {
  const warning = await prisma.warning.findUnique({
    where: { id: warningId },
    include: { user: { select: { name: true } } },
  })
  if (!warning) return null

  const base = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')
  const fileLink = warningPdfPublicUrl(warning.id, warning.fileUrl, base)
  const ordinal = options?.warningNumber ?? null
  const title = ordinal
    ? `ได้รับใบเตือน (ครั้งที่ ${ordinal})`
    : 'ได้รับใบเตือน'

  const message = fileLink
    ? `${warning.reason}\n\n📎 เปิดไฟล์ใบเตือน: ${fileLink}`
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

  const lineSent = await sendLineMessage(warning.userId, lineText)

  await prisma.warning.update({
    where: { id: warningId },
    data: { sentToLine: lineSent },
  })

  return { fileLink }
}
