import { prisma } from '@/lib/prisma'
import { pushLineText } from '@/lib/line-api'
import { isLineOaConfigured } from '@/lib/line-config'
import { createNotification } from '@/lib/notifications'

export type LineHrSendResult = {
  ok: boolean
  sent: number
  failed: number
  errors: string[]
}

export async function sendLineHrMessage(params: {
  message: string
  userId?: string | null
  broadcastLinked?: boolean
  notifyInApp?: boolean
}): Promise<LineHrSendResult> {
  if (!isLineOaConfigured()) {
    return { ok: false, sent: 0, failed: 0, errors: ['ระบบยังไม่ได้ตั้งค่า LINE OA บนเซิร์ฟเวอร์'] }
  }

  const message = params.message.trim()
  if (!message) {
    return { ok: false, sent: 0, failed: 0, errors: ['กรุณากรอกข้อความ'] }
  }

  const errors: string[] = []
  let sent = 0
  let failed = 0

  const deliver = async (userId: string, lineUserId: string, name: string) => {
    const ok = await pushLineText(lineUserId, message)
    if (ok) {
      sent++
      if (params.notifyInApp !== false) {
        await createNotification({
          userId,
          type: 'SYSTEM',
          title: 'ข้อความจาก HR',
          message: message.slice(0, 500),
          link: '/notifications',
        })
      }
    } else {
      failed++
      errors.push(`${name}: ส่ง LINE ไม่สำเร็จ`)
    }
  }

  if (params.broadcastLinked) {
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE', lineUserId: { not: null } },
      select: { id: true, name: true, lineUserId: true },
    })
    if (users.length === 0) {
      return {
        ok: false,
        sent: 0,
        failed: 0,
        errors: ['ยังไม่มีพนักงานที่ผูก LINE OA'],
      }
    }
    for (const u of users) {
      if (!u.lineUserId) continue
      await deliver(u.id, u.lineUserId, u.name)
    }
  } else if (params.userId) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, name: true, lineUserId: true, lineId: true },
    })
    if (!user) {
      return { ok: false, sent: 0, failed: 0, errors: ['ไม่พบพนักงาน'] }
    }
    if (!user.lineUserId) {
      const hint = user.lineId
        ? `${user.name}: มี LINE ID แต่ยังไม่ผูก OA — ให้สร้างรหัสที่โปรไฟล์แล้วส่งในแชท OA`
        : `${user.name}: ยังไม่ผูก LINE OA`
      return { ok: false, sent: 0, failed: 0, errors: [hint] }
    }
    await deliver(user.id, user.lineUserId, user.name)
  } else {
    return { ok: false, sent: 0, failed: 0, errors: ['เลือกพนักงานหรือส่งถึงผู้ที่ผูก LINE ทั้งหมด'] }
  }

  return {
    ok: sent > 0 && failed === 0,
    sent,
    failed,
    errors,
  }
}
