import { prisma } from '@/lib/prisma'
import type { NotificationType, Role } from '@prisma/client'

// ─── Create in-app notification ───────────────────────
export async function createNotification(params: {
  userId: string
  type: NotificationType
  title: string
  message: string
  link?: string
}) {
  return prisma.notification.create({ data: params })
}

// ─── Notify all users with specific role ─────────────
export async function notifyRole(
  role: Role,
  type: NotificationType,
  title: string,
  message: string,
  link?: string
) {
  const users = await prisma.user.findMany({
    where: { role, status: 'ACTIVE' },
    select: { id: true },
  })
  await prisma.notification.createMany({
    data: users.map((u) => ({ userId: u.id, type, title, message, link: link ?? null })),
  })
}

// ─── LINE Messaging API (Messaging API — ส่งถึงคนเดียว) ──
export async function sendLineMessage(userId: string, message: string): Promise<boolean> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!accessToken) {
    console.log('[LINE Mock] to user:', userId, '\n', message)
    return true
  }

  // Get user's LINE ID from DB
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { lineId: true } })
  if (!user?.lineId) {
    console.log(`[LINE] User ${userId} has no lineId, skipping`)
    return false
  }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: user.lineId,
        messages: [{ type: 'text', text: message }],
      }),
    })
    return res.ok
  } catch {
    console.error('[LINE Messaging Error]')
    return false
  }
}

// ─── LINE Flex Message ────────────────────────────────
export async function sendLineFlexMessage(userId: string, altText: string, contents: object): Promise<boolean> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!accessToken) {
    console.log('[LINE Flex Mock] to user:', userId)
    return true
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { lineId: true } })
  if (!user?.lineId) return false

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: user.lineId,
        messages: [{ type: 'flex', altText, contents }],
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── LINE Notify (broadcast — Notify token) ──────────
export async function sendLineNotify(message: string, token?: string): Promise<boolean> {
  const lineToken = token ?? process.env.LINE_NOTIFY_TOKEN
  if (!lineToken) {
    console.log('[LINE Notify Mock]', message)
    return true
  }
  try {
    const res = await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lineToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ message }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── Payslip LINE Flex Card ───────────────────────────
export async function sendPayslipLine(userId: string, payroll: {
  name: string
  month: number
  year: number
  baseSalary: number
  lateDeduction: number
  absentDeduction: number
  socialSecurity: number
  netSalary: number
}): Promise<boolean> {
  const monthNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  const monthLabel = `${monthNames[payroll.month - 1]} ${payroll.year + 543}`

  const flex = {
    type: 'bubble',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#1e3a8a',
      contents: [
        { type: 'text', text: 'สลิปเงินเดือน', color: '#ffffff', size: 'lg', weight: 'bold' },
        { type: 'text', text: monthLabel, color: '#93c5fd', size: 'sm' },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        { type: 'text', text: payroll.name, weight: 'bold', size: 'md' },
        { type: 'separator', margin: 'sm' },
        row('เงินเดือนฐาน', `฿${payroll.baseSalary.toLocaleString()}`),
        row('หักมาสาย', `-฿${payroll.lateDeduction.toFixed(2)}`),
        row('หักขาดงาน', `-฿${payroll.absentDeduction.toFixed(2)}`),
        row('ประกันสังคม', `-฿${payroll.socialSecurity.toFixed(2)}`),
        { type: 'separator', margin: 'sm' },
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: 'รับสุทธิ', weight: 'bold', color: '#1e40af', flex: 1 },
          { type: 'text', text: `฿${payroll.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`, weight: 'bold', color: '#1e40af', align: 'end', flex: 1 },
        ]},
      ],
    },
  }

  return sendLineFlexMessage(userId, `สลิปเงินเดือน ${monthLabel}`, flex)
}

function row(label: string, value: string) {
  return {
    type: 'box', layout: 'horizontal',
    contents: [
      { type: 'text', text: label, color: '#6b7280', flex: 1, size: 'sm' },
      { type: 'text', text: value, align: 'end', flex: 1, size: 'sm' },
    ],
  }
}

// ─── Audit log ────────────────────────────────────────
export async function createAuditLog(params: {
  actorId: string
  targetId?: string
  targetType?: string
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'LOGIN' | 'LOGOUT' | 'PASSWORD_RESET'
  before?: object
  after?: object
  ip?: string
  userAgent?: string
}) {
  return prisma.auditLog.create({
    data: {
      ...params,
      before:    params.before    ? JSON.stringify(params.before)    : undefined,
      after:     params.after     ? JSON.stringify(params.after)     : undefined,
    },
  })
}
