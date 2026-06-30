import { replyLineText } from '@/lib/line-api'
import type { LineWebhookEvent } from '@/lib/line-api'
import {
  extractLinkCodeFromMessage,
  findUserByLineUserId,
  linkLineUserWithCode,
  unlinkLineUser,
} from '@/lib/line-link'
import { getLineWebhookUrl } from '@/lib/line-config'
import { prisma } from '@/lib/prisma'
import type { TaskStatus, Role } from '@prisma/client'
import { runLineChainApproval } from '@/lib/line-chain-approval'
import Anthropic from '@anthropic-ai/sdk'

const APP = process.env.NEXT_PUBLIC_APP_NAME ?? 'HRFlow'

// ─── Help text ────────────────────────────────────────────────────────────────

function helpText(): string {
  return [
    `📱 ${APP} — LINE OA`,
    '',
    '🔹 คำสั่งพื้นฐาน:',
    '• ลิงก์ XXXXXX — ผูกบัญชี',
    '• สถานะ — ดูการเชื่อม',
    '• ยกเลิกลิงก์ — ยกเลิกการผูก',
    '',
    '🔹 บริการตนเอง (หลังผูกบัญชีแล้ว):',
    '• งานวันนี้ — งานที่ต้องทำวันนี้',
    '• งานค้าง — งานเกินกำหนด',
    '• วันลาคงเหลือ — วันลาที่เหลือ',
    '• ประวัติลา — คำขอลาล่าสุด',
    '• นัดวันนี้ — นัดหมายวันนี้',
    '• สรุป — สรุปงาน (ผู้จัดการ/CEO)',
    '',
    '🔹 AI ผู้ช่วย:',
    '• พิมพ์คำถามใดก็ได้ เช่น "คดี ABC ถึงไหน"',
    '',
    `Webhook: ${getLineWebhookUrl()}`,
  ].join('\n')
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function bangkokNow(): Date {
  return new Date(Date.now() + 7 * 3600_000)
}
function todayRange(): { start: Date; end: Date } {
  const b = bangkokNow()
  const start = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()))
  const end   = new Date(start.getTime() + 86400_000 - 1)
  return { start, end }
}
function formatDate(d: Date | null | undefined): string {
  if (!d) return '—'
  const b = new Date(d.getTime() + 7 * 3600_000)
  return b.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

const ACTIVE_STATUSES: TaskStatus[] = ['PENDING', 'NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_DOC', 'WAITING_REVIEW', 'REVISION']

// ─── Self-service command handlers ───────────────────────────────────────────

async function cmdTodayTasks(userId: string): Promise<string> {
  const { start, end } = todayRange()
  const tasks = await prisma.taskAssignment.findMany({
    where: {
      assigneeId: userId,
      status: { in: ACTIVE_STATUSES },
      OR: [
        { dueDate: { gte: start, lte: end } },
        { courtDate: { gte: start, lte: end } },
      ],
    },
    select: { title: true, priority: true, dueDate: true, courtDate: true, caseNumber: true },
    orderBy: { dueDate: 'asc' },
    take: 10,
  })

  if (tasks.length === 0) return '✅ ไม่มีงานที่กำหนดวันนี้'
  const lines = tasks.map((t, i) => {
    const dueInfo = t.courtDate
      ? `🔴 ศาล ${formatDate(t.courtDate)}`
      : `📅 ${formatDate(t.dueDate)}`
    return `${i + 1}. ${t.title}${t.caseNumber ? ` [${t.caseNumber}]` : ''}\n   ${dueInfo}`
  })
  return `📋 งานวันนี้ (${tasks.length} รายการ)\n\n${lines.join('\n')}`
}

async function cmdOverdueTasks(userId: string): Promise<string> {
  const tasks = await prisma.taskAssignment.findMany({
    where: { assigneeId: userId, status: { in: ACTIVE_STATUSES }, dueDate: { lt: new Date() } },
    select: { title: true, dueDate: true, caseNumber: true, priority: true },
    orderBy: { dueDate: 'asc' },
    take: 10,
  })

  if (tasks.length === 0) return '✅ ไม่มีงานค้าง'
  const lines = tasks.map((t, i) =>
    `${i + 1}. ${t.title}${t.caseNumber ? ` [${t.caseNumber}]` : ''}\n   🗓 กำหนด: ${formatDate(t.dueDate)}`
  )
  return `🚨 งานค้าง (${tasks.length} รายการ)\n\n${lines.join('\n')}`
}

async function cmdLeaveBalance(userId: string): Promise<string> {
  const year = bangkokNow().getUTCFullYear()
  const bal = await prisma.leaveBalance.findUnique({ where: { userId_year: { userId, year } } })
  if (!bal) return `ไม่พบข้อมูลวันลาปี ${year + 543}`
  return [
    `🏖 วันลาคงเหลือ ปี ${year + 543}`,
    '',
    `ลาพักร้อน:  ${bal.vacation} วัน`,
    `ลาป่วย:     ${bal.sick} วัน`,
    `ลากิจ:      ${bal.personal} วัน`,
  ].join('\n')
}

async function cmdLeaveHistory(userId: string): Promise<string> {
  const leaves = await prisma.leaveRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { type: true, startDate: true, days: true, status: true },
  })
  if (leaves.length === 0) return 'ยังไม่มีประวัติการลา'
  const STATUS_TH: Record<string, string> = {
    PENDING: '⏳รอ', ADMIN_APPROVED: '✅รอขั้นสุด', APPROVED: '✅อนุมัติ', REJECTED: '❌ปฏิเสธ',
  }
  const lines = leaves.map((l, i) =>
    `${i + 1}. ${l.type} ${l.days}วัน (${formatDate(l.startDate)}) — ${STATUS_TH[l.status] ?? l.status}`
  )
  return `🗓 ประวัติลา 5 รายการล่าสุด\n\n${lines.join('\n')}`
}

async function cmdTodayAppointments(userId: string): Promise<string> {
  const { start, end } = todayRange()
  const [events, tasks] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { createdById: userId, startAt: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
      orderBy: { startAt: 'asc' }, take: 10,
    }),
    prisma.taskAssignment.findMany({
      where: { assigneeId: userId, courtDate: { gte: start, lte: end } },
      select: { title: true, courtDate: true, caseNumber: true, appointmentPlace: true },
      take: 5,
    }),
  ])

  const lines: string[] = []
  for (const e of events) {
    const time = new Date(e.startAt.getTime() + 7 * 3600_000)
    const hhmm = `${String(time.getUTCHours()).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')}`
    lines.push(`📅 ${hhmm} — ${e.title}${e.location ? ` @ ${e.location}` : ''}`)
  }
  for (const t of tasks) {
    if (!t.courtDate) continue
    const time = new Date(t.courtDate.getTime() + 7 * 3600_000)
    const hhmm = `${String(time.getUTCHours()).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')}`
    lines.push(`⚖️ ${hhmm} — ${t.title}${t.caseNumber ? ` [${t.caseNumber}]` : ''}${t.appointmentPlace ? ` @ ${t.appointmentPlace}` : ''}`)
  }

  if (lines.length === 0) return '✅ ไม่มีนัดหมายวันนี้'
  return `📅 นัดหมายวันนี้ (${lines.length} รายการ)\n\n${lines.join('\n')}`
}

async function cmdSummary(userId: string, role: string): Promise<string> {
  const isExec = ['CEO', 'SUPER_ADMIN', 'MANAGER_HR', 'MANAGER'].includes(role)
  if (!isExec) return 'คำสั่งนี้สำหรับผู้จัดการและ CEO เท่านั้น'

  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 86400_000)

  const [overdue, courtIn7, pendingLeave] = await Promise.all([
    prisma.taskAssignment.count({ where: { status: 'OVERDUE' } }),
    prisma.taskAssignment.count({ where: { courtDate: { gte: now, lte: in7 }, status: { in: ACTIVE_STATUSES } } }),
    prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
  ])

  const dateStr = bangkokNow().toLocaleDateString('th-TH', { weekday: 'short', month: 'short', day: 'numeric' })
  return [
    `📊 สรุป — ${dateStr}`,
    '',
    `🚨 งานเกินกำหนด:   ${overdue} รายการ`,
    `⚖️ นัดศาลใน 7 วัน: ${courtIn7} คดี`,
    `🏖 คำขอลาค้าง:     ${pendingLeave} ใบ`,
  ].join('\n')
}

// ─── Postback: approval actions ───────────────────────────────────────────────

type DocType = 'LEAVE' | 'EXPENSE' | 'OUTSIDE' | 'FORGOT_SCAN'

const EXPENSE_APPROVER_ROLES: Role[] = ['CEO', 'SUPER_ADMIN', 'MANAGER_HR', 'HR', 'ADMIN']

async function handleApprovalPostback(
  lineUserId: string,
  replyToken: string,
  action: 'APPROVE' | 'REJECT',
  docType: DocType,
  id: string,
): Promise<void> {
  const user = await findUserByLineUserId(lineUserId)
  if (!user) {
    await replyLineText(replyToken, 'ยังไม่ผูกบัญชี LINE — ไปที่โปรไฟล์แล้วส่ง "ลิงก์ XXXXXX"')
    return
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } })
  const role = (dbUser?.role ?? 'EMPLOYEE') as Role

  const icon = action === 'APPROVE' ? '✅' : '❌'
  const actionLabel = action === 'APPROVE' ? 'อนุมัติ' : 'ปฏิเสธ'

  try {
    if (docType === 'LEAVE' || docType === 'OUTSIDE' || docType === 'FORGOT_SCAN') {
      const result = await runLineChainApproval(
        prisma,
        docType,
        id,
        user.id,
        role,
        action,
      )
      if (!result.ok) {
        await replyLineText(replyToken, result.message)
        return
      }
      await replyLineText(
        replyToken,
        `${icon} ${actionLabel}${result.docLabel} (${result.stepName})`,
      )
      return
    }

    if (docType === 'EXPENSE') {
      if (!EXPENSE_APPROVER_ROLES.includes(role)) {
        await replyLineText(replyToken, 'คุณไม่มีสิทธิ์อนุมัติรายการนี้')
        return
      }

      const exp = await prisma.expenseClaim.findUnique({ where: { id } })
      if (!exp) { await replyLineText(replyToken, 'ไม่พบคำขอเบิก'); return }
      if (!['PENDING', 'SUPERVISOR_APPROVED', 'CEO_APPROVED'].includes(exp.status)) {
        await replyLineText(replyToken, `คำขอนี้ดำเนินการแล้ว (${exp.status})`); return
      }
      const newExpStatus = action === 'APPROVE' ? 'CEO_APPROVED' : 'REJECTED'
      await prisma.expenseClaim.update({ where: { id }, data: { status: newExpStatus } })
      await replyLineText(replyToken, `${icon} ${actionLabel}คำขอเบิกค่าใช้จ่ายสำเร็จ`)
    }
  } catch (err) {
    console.error('[handleApprovalPostback]', err)
    await replyLineText(replyToken, 'เกิดข้อผิดพลาด — กรุณาดำเนินการในแอป')
  }
}

// ─── AI fallback ──────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

async function aiReply(question: string, userId: string, role: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return 'ระบบ AI ยังไม่ได้ตั้งค่า — พิมพ์ "ช่วยเหลือ" เพื่อดูคำสั่งที่ใช้ได้'
  }
  try {
    const now = bangkokNow()
    const myTasks = await prisma.taskAssignment.findMany({
      where: { assigneeId: userId, status: { in: ACTIVE_STATUSES } },
      select: { title: true, caseNumber: true, status: true, dueDate: true },
      orderBy: { dueDate: 'asc' }, take: 20,
    })
    const myLeave = await prisma.leaveBalance.findUnique({
      where: { userId_year: { userId, year: now.getUTCFullYear() } },
    })

    const ctx = [
      `วันที่: ${now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}`,
      `บทบาท: ${role}`,
      `งานที่รับผิดชอบ (${myTasks.length} รายการ): ${myTasks.map(t => `${t.title}${t.caseNumber ? `[${t.caseNumber}]` : ''} (${t.status})`).join(', ')}`,
      myLeave ? `วันลาคงเหลือ: พักร้อน ${myLeave.vacation}วัน ป่วย ${myLeave.sick}วัน กิจ ${myLeave.personal}วัน` : '',
    ].filter(Boolean).join('\n')

    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `คุณคือผู้ช่วย AI ของ ${APP} ตอบสั้น กระชับ เป็นภาษาไทย ใช้ข้อมูลที่ให้ไว้เท่านั้น อย่าสร้างข้อมูลปลอม\n\nบริบท:\n${ctx}`,
      messages: [{ role: 'user', content: question }],
    })

    const txt = resp.content[0]?.type === 'text' ? resp.content[0].text : 'ไม่สามารถประมวลผลได้'
    return txt.slice(0, 4000)
  } catch (err) {
    console.error('[aiReply]', err)
    return 'เกิดข้อผิดพลาดในการตอบ — กรุณาลองใหม่'
  }
}

// ─── Main webhook event handler ───────────────────────────────────────────────

export async function handleLineWebhookEvent(event: LineWebhookEvent): Promise<void> {
  const lineUserId = event.source?.userId
  const replyToken = event.replyToken

  // ── Follow ────────────────────────────────────────────────────────────────
  if (event.type === 'follow' && replyToken) {
    await replyLineText(
      replyToken,
      [
        `สวัสดีครับ/ค่ะ ยินดีต้อนรับ ${APP}`,
        '',
        'เพื่อรับแจ้งเตือนและใช้บริการตนเอง:',
        '1) เข้าแอป HRFlow → โปรไฟล์',
        '2) กด "สร้างรหัสเชื่อม LINE"',
        '3) ส่งข้อความ: ลิงก์ XXXXXX',
        '',
        'พิมพ์ "ช่วยเหลือ" เพื่อดูคำสั่งทั้งหมด',
      ].join('\n'),
    )
    return
  }

  // ── Postback (approval buttons) ──────────────────────────────────────────
  if (event.type === 'postback' && lineUserId && replyToken) {
    const postbackData = (event as unknown as { postback?: { data?: string } }).postback?.data ?? ''
    const params = new URLSearchParams(postbackData)
    const action  = params.get('action')
    const docType = params.get('type')
    const id      = params.get('id')

    if ((action === 'APPROVE' || action === 'REJECT') && docType && id) {
      await handleApprovalPostback(lineUserId, replyToken, action, docType as DocType, id)
    } else {
      await replyLineText(replyToken, 'ไม่รู้จักคำสั่งนี้')
    }
    return
  }

  // ── Text messages only ────────────────────────────────────────────────────
  if (event.type !== 'message' || event.message?.type !== 'text' || !lineUserId || !replyToken) {
    return
  }

  const text  = (event.message.text ?? '').trim()
  const lower = text.toLowerCase()

  // ── Account commands (no auth required) ──────────────────────────────────
  if (lower === 'ช่วยเหลือ' || lower === 'help') {
    await replyLineText(replyToken, helpText())
    return
  }

  if (lower === 'สถานะ' || lower === 'status') {
    const linked = await findUserByLineUserId(lineUserId)
    if (!linked) {
      await replyLineText(replyToken, 'ยังไม่ได้ผูกบัญชี\n\nไปที่โปรไฟล์ → สร้างรหัส → ส่ง "ลิงก์ รหัส6ตัว"')
      return
    }
    await replyLineText(replyToken, `✅ ผูกแล้ว\nชื่อ: ${linked.name}\nอีเมล: ${linked.email}`)
    return
  }

  if (lower === 'ยกเลิกลิงก์' || lower === 'unlink') {
    const ok = await unlinkLineUser(lineUserId)
    await replyLineText(replyToken, ok ? 'ยกเลิกการผูกบัญชีแล้ว' : 'ไม่พบบัญชีที่ผูกอยู่')
    return
  }

  if (lower === 'user-id' || lower === 'userid' || lower === 'รหัสไลน์') {
    await replyLineText(replyToken, `📱 LINE User ID:\n\n${lineUserId}`)
    return
  }

  const code = extractLinkCodeFromMessage(text)
  if (code) {
    const result = await linkLineUserWithCode(lineUserId, code)
    await replyLineText(
      replyToken,
      result.ok
        ? `✅ ผูกบัญชีสำเร็จ\n${result.userName}\n\nจะได้รับแจ้งเตือนผ่าน LINE และใช้คำสั่งบริการตนเองได้แล้ว`
        : `❌ ${result.message}`,
    )
    return
  }

  // ── Self-service (require linked account) ────────────────────────────────
  const linked = await findUserByLineUserId(lineUserId)
  if (!linked) {
    await replyLineText(replyToken, 'ไม่เข้าใจคำสั่ง — พิมพ์ "ช่วยเหลือ" หรือส่ง "ลิงก์ รหัส6ตัว" จากหน้าโปรไฟล์')
    return
  }

  const dbUser = await prisma.user.findUnique({ where: { id: linked.id }, select: { role: true } })
  const role = dbUser?.role ?? 'EMPLOYEE'

  if (lower === 'งานวันนี้' || lower === 'งาน') {
    await replyLineText(replyToken, await cmdTodayTasks(linked.id)); return
  }
  if (lower === 'งานค้าง' || lower === 'งานเกินกำหนด') {
    await replyLineText(replyToken, await cmdOverdueTasks(linked.id)); return
  }
  if (lower === 'วันลาคงเหลือ' || lower === 'ลาคงเหลือ' || lower === 'ลา') {
    await replyLineText(replyToken, await cmdLeaveBalance(linked.id)); return
  }
  if (lower === 'ประวัติลา' || lower === 'ประวัติการลา') {
    await replyLineText(replyToken, await cmdLeaveHistory(linked.id)); return
  }
  if (lower === 'นัดวันนี้' || lower === 'นัดหมายวันนี้' || lower === 'นัดหมาย') {
    await replyLineText(replyToken, await cmdTodayAppointments(linked.id)); return
  }
  if (lower === 'สรุป' || lower === 'สรุปวันนี้' || lower === 'สรุปงาน') {
    await replyLineText(replyToken, await cmdSummary(linked.id, role)); return
  }

  // ── AI fallback ──────────────────────────────────────────────────────────
  const aiText = await aiReply(text, linked.id, role)
  await replyLineText(replyToken, aiText)
}
