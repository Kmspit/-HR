import { replyLineText } from '@/lib/line-api'
import type { LineWebhookEvent } from '@/lib/line-api'
import {
  extractLinkCodeFromMessage,
  findUserByLineUserId,
  linkLineUserWithCode,
  unlinkLineUser,
} from '@/lib/line-link'
import { getLineWebhookUrl } from '@/lib/line-config'

const APP = process.env.NEXT_PUBLIC_APP_NAME ?? 'HRFlow'

function helpText(): string {
  return [
    `📱 ${APP} — LINE OA`,
    '',
    '🔹 ผูกบัญชี:',
    '1) เปิดแอป → โปรไฟล์ → เชื่อม LINE',
    '2) สร้างรหัส 6 ตัว',
    '3) ส่งข้อความ: ลิงก์ XXXXXX',
    '',
    '🔹 คำสั่ง:',
    '• ลิงก์ XXXXXX — ผูกบัญชี',
    '• สถานะ — ดูการเชื่อม',
    '• ยกเลิกลิงก์ — ยกเลิกการผูก',
    '• ช่วยเหลือ — แสดงวิธีใช้',
    '',
    `Webhook: ${getLineWebhookUrl()}`,
  ].join('\n')
}

export async function handleLineWebhookEvent(event: LineWebhookEvent): Promise<void> {
  const lineUserId = event.source?.userId
  const replyToken = event.replyToken

  if (event.type === 'follow' && replyToken) {
    await replyLineText(
      replyToken,
      [
        `สวัสดีครับ/ค่ะ ยินดีต้อนรับ ${APP}`,
        '',
        'เพื่อรับใบเตือน แจ้งเตือน HR (หลังสแกนเช็คอิน) และข้อความจากระบบ:',
        '1) เข้าแอป HRFlow → โปรไฟล์',
        '2) กด "สร้างรหัสเชื่อม LINE"',
        '3) ส่งข้อความมาที่แชทนี้: ลิงก์ XXXXXX',
        '',
        'พิมพ์ "ช่วยเหลือ" เพื่อดูคำสั่งทั้งหมด',
      ].join('\n'),
    )
    return
  }

  if (event.type !== 'message' || event.message?.type !== 'text' || !lineUserId || !replyToken) {
    return
  }

  const text = (event.message.text ?? '').trim()
  const lower = text.toLowerCase()

  if (lower === 'ช่วยเหลือ' || lower === 'help') {
    await replyLineText(replyToken, helpText())
    return
  }

  if (lower === 'สถานะ' || lower === 'status') {
    const linked = await findUserByLineUserId(lineUserId)
    if (!linked) {
      await replyLineText(
        replyToken,
        'ยังไม่ได้ผูกบัญชี\n\nไปที่โปรไฟล์ในแอป → สร้างรหัส → ส่ง "ลิงก์ รหัส6ตัว"',
      )
      return
    }
    await replyLineText(
      replyToken,
      `✅ ผูกแล้ว\nชื่อ: ${linked.name}\nอีเมล: ${linked.email}`,
    )
    return
  }

  if (lower === 'ยกเลิกลิงก์' || lower === 'unlink') {
    const ok = await unlinkLineUser(lineUserId)
    await replyLineText(
      replyToken,
      ok ? 'ยกเลิกการผูกบัญชีแล้ว' : 'ไม่พบบัญชีที่ผูกอยู่',
    )
    return
  }

  // HR Admin ส่ง "user-id" → ระบบตอบด้วย LINE User ID ของตัวเอง (สำหรับตั้งค่า ATTENDANCE_LINE_NOTIFY_TARGETS)
  if (lower === 'user-id' || lower === 'userid' || lower === 'รหัสไลน์') {
    await replyLineText(
      replyToken,
      [
        '📱 LINE User ID ของคุณ:',
        '',
        lineUserId,
        '',
        'คัดลอก ID นี้ไปใส่ใน Vercel:',
        'Settings → Environment Variables',
        'ชื่อ: ATTENDANCE_LINE_NOTIFY_TARGETS',
        'ค่า: ' + lineUserId,
        '',
        '(หลังบันทึกแล้วระบบจะ push ตรงมาหาคุณ)',
      ].join('\n'),
    )
    return
  }

  const code = extractLinkCodeFromMessage(text)
  if (code) {
    const result = await linkLineUserWithCode(lineUserId, code)
    await replyLineText(
      replyToken,
      result.ok
        ? `✅ ผูกบัญชีสำเร็จ\n${result.userName}\n\nจะได้รับใบเตือนและแจ้งเตือนผ่าน LINE นี้`
        : `❌ ${result.message}`,
    )
    return
  }

  await replyLineText(
    replyToken,
    'ไม่เข้าใจคำสั่ง — พิมพ์ "ช่วยเหลือ" หรือส่ง "ลิงก์ รหัส6ตัว" จากหน้าโปรไฟล์',
  )
}
