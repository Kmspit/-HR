/**
 * LINE Flex Message builders — Phase 14
 * All functions return a LINE message object ready for pushLineMessages / replyLineMessages.
 */

type FlexBox     = { type: 'box'; layout: string; contents: unknown[]; [k: string]: unknown }
type FlexText    = { type: 'text'; text: string;  [k: string]: unknown }
type FlexButton  = { type: 'button'; action: { type: string; label: string; data?: string; uri?: string }; [k: string]: unknown }
type FlexSep     = { type: 'separator'; [k: string]: unknown }
type FlexBubble  = { type: 'bubble'; [k: string]: unknown }
type FlexMessage = { type: 'flex'; altText: string; contents: FlexBubble }

function row(label: string, value: string, valueColor = '#1e293b'): FlexBox {
  return {
    type: 'box', layout: 'horizontal', margin: 'xs',
    contents: [
      { type: 'text', text: label,  size: 'sm', color: '#6b7280',    flex: 3 } as FlexText,
      { type: 'text', text: value,  size: 'sm', color: valueColor,   flex: 4, wrap: true, align: 'end' } as FlexText,
    ],
  }
}

function sep(margin = 'sm'): FlexSep { return { type: 'separator', margin } }

// ─── Approval card ────────────────────────────────────────────────────────────

type ApprovalType = 'LEAVE' | 'EXPENSE' | 'OUTSIDE' | 'FORGOT_SCAN'

const APPROVAL_CFG: Record<ApprovalType, { label: string; color: string; icon: string }> = {
  LEAVE:       { label: 'คำขอลา',          color: '#3b82f6', icon: '🏖' },
  EXPENSE:     { label: 'เบิกค่าใช้จ่าย', color: '#8b5cf6', icon: '💰' },
  OUTSIDE:     { label: 'ปฏิบัติงานนอก',  color: '#f97316', icon: '📍' },
  FORGOT_SCAN: { label: 'ลืมสแกน',         color: '#6b7280', icon: '🔍' },
}

export function buildApprovalFlex(params: {
  approvalType: ApprovalType
  id: string
  title: string
  requesterName: string
  details: Array<{ label: string; value: string }>
}): FlexMessage {
  const { approvalType, id, title, requesterName, details } = params
  const cfg = APPROVAL_CFG[approvalType]
  const dataApprove = `action=APPROVE&type=${approvalType}&id=${id}`
  const dataReject  = `action=REJECT&type=${approvalType}&id=${id}`

  const bubble: FlexBubble = {
    type: 'bubble',
    header: {
      type: 'box', layout: 'horizontal', backgroundColor: cfg.color, paddingAll: 'md',
      contents: [
        { type: 'text', text: cfg.icon, size: 'xl', flex: 0 } as FlexText,
        {
          type: 'box', layout: 'vertical', flex: 1, margin: 'sm',
          contents: [
            { type: 'text', text: cfg.label,          color: '#ffffff', weight: 'bold', size: 'md' },
            { type: 'text', text: '🔔 รอการอนุมัติ', color: '#e0f2fe', size: 'xs' },
          ],
        } as FlexBox,
      ],
    } as FlexBox,
    body: {
      type: 'box', layout: 'vertical', paddingAll: 'md', spacing: 'xs',
      contents: [
        { type: 'text', text: title,                   weight: 'bold', size: 'md', wrap: true } as FlexText,
        { type: 'text', text: `โดย: ${requesterName}`, size: 'sm', color: '#64748b', margin: 'xs' } as FlexText,
        sep(),
        ...details.map(d => row(d.label, d.value)),
      ],
    } as FlexBox,
    footer: {
      type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: 'md',
      contents: [
        {
          type: 'button', style: 'primary', color: '#22c55e', flex: 1,
          action: { type: 'postback', label: '✅ อนุมัติ', data: dataApprove },
        } as FlexButton,
        {
          type: 'button', style: 'secondary', flex: 1,
          action: { type: 'postback', label: '❌ ปฏิเสธ', data: dataReject },
        } as FlexButton,
      ],
    } as FlexBox,
  }

  return { type: 'flex', altText: `${cfg.label}: ${title} — รอการอนุมัติ`, contents: bubble }
}

// ─── Task notification card ───────────────────────────────────────────────────

type TaskNotifType = 'ASSIGNED' | 'DEADLINE' | 'OVERDUE'

const TASK_CFG: Record<TaskNotifType, { label: string; color: string; icon: string }> = {
  ASSIGNED: { label: 'งานใหม่',       color: '#3b82f6', icon: '📋' },
  DEADLINE: { label: 'ใกล้ครบกำหนด', color: '#f59e0b', icon: '⏰' },
  OVERDUE:  { label: 'งานเกินกำหนด', color: '#ef4444', icon: '🚨' },
}

export function buildTaskNotifyFlex(params: {
  title: string
  caseNumber?: string | null
  deadline?: string | null
  priority: string
  notifType: TaskNotifType
  appUrl?: string
}): FlexMessage {
  const { title, caseNumber, deadline, priority, notifType, appUrl } = params
  const cfg = TASK_CFG[notifType]

  const details: Array<{ label: string; value: string }> = [
    ...(caseNumber ? [{ label: 'เลขคดี', value: caseNumber }] : []),
    ...(deadline   ? [{ label: 'กำหนด',  value: deadline   }] : []),
    { label: 'ความสำคัญ', value: priority },
  ]

  const footerContents: FlexButton[] = appUrl
    ? [{
        type: 'button', style: 'link',
        action: { type: 'uri', label: '📱 ดูงาน', uri: appUrl },
      } as FlexButton]
    : []

  const bubble: FlexBubble = {
    type: 'bubble',
    header: {
      type: 'box', layout: 'horizontal', backgroundColor: cfg.color, paddingAll: 'md',
      contents: [
        { type: 'text', text: cfg.icon, size: 'xl', flex: 0 } as FlexText,
        { type: 'text', text: cfg.label, color: '#ffffff', weight: 'bold', size: 'md', margin: 'sm' } as FlexText,
      ],
    } as FlexBox,
    body: {
      type: 'box', layout: 'vertical', paddingAll: 'md', spacing: 'xs',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'md', wrap: true } as FlexText,
        sep(),
        ...details.map(d => row(d.label, d.value)),
      ],
    } as FlexBox,
    ...(footerContents.length > 0
      ? { footer: { type: 'box', layout: 'vertical', paddingAll: 'md', contents: footerContents } as FlexBox }
      : {}),
  }

  return { type: 'flex', altText: `${cfg.label}: ${title}`, contents: bubble }
}

// ─── Calendar reminder card ───────────────────────────────────────────────────

const CAL_CFG: Record<string, { color: string; icon: string }> = {
  COURT:    { color: '#ef4444', icon: '⚖️' },
  CLIENT:   { color: '#3b82f6', icon: '🤝' },
  DEBTOR:   { color: '#f97316', icon: '💼' },
  INTERNAL: { color: '#22c55e', icon: '🏢' },
}

export function buildCalendarReminderFlex(params: {
  title: string
  eventType: string
  startAt: string
  location?: string | null
  caseNumber?: string | null
  courtName?: string | null
  daysUntil: number
}): FlexMessage {
  const { title, eventType, startAt, location, caseNumber, courtName, daysUntil } = params
  const cfg = CAL_CFG[eventType] ?? { color: '#6b7280', icon: '📅' }
  const dayLabel = daysUntil === 0 ? 'วันนี้!' : daysUntil === 1 ? 'พรุ่งนี้' : `อีก ${daysUntil} วัน`

  const details: Array<{ label: string; value: string }> = [
    { label: 'วันเวลา', value: startAt },
    ...(courtName  ? [{ label: 'ศาล', value: courtName }] : []),
    ...(location   ? [{ label: 'สถานที่', value: location }] : []),
    ...(caseNumber ? [{ label: 'เลขคดี', value: caseNumber }] : []),
  ]

  const bubble: FlexBubble = {
    type: 'bubble',
    header: {
      type: 'box', layout: 'horizontal', backgroundColor: cfg.color, paddingAll: 'md',
      contents: [
        { type: 'text', text: cfg.icon, size: 'xl', flex: 0 } as FlexText,
        {
          type: 'box', layout: 'vertical', flex: 1, margin: 'sm',
          contents: [
            { type: 'text', text: '📅 แจ้งเตือนนัดหมาย', color: '#ffffff', weight: 'bold', size: 'sm' },
            { type: 'text', text: dayLabel,                color: '#fef3c7', size: 'xs' },
          ],
        } as FlexBox,
      ],
    } as FlexBox,
    body: {
      type: 'box', layout: 'vertical', paddingAll: 'md', spacing: 'xs',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'md', wrap: true } as FlexText,
        sep(),
        ...details.map(d => row(d.label, d.value)),
      ],
    } as FlexBox,
  }

  return { type: 'flex', altText: `แจ้งเตือนนัด: ${title} — ${dayLabel}`, contents: bubble }
}

// ─── CEO daily summary card ───────────────────────────────────────────────────

function statRow(icon: string, label: string, value: number, color: string): FlexBox {
  return {
    type: 'box', layout: 'horizontal', margin: 'xs',
    contents: [
      { type: 'text', text: `${icon} ${label}`, size: 'sm', color: '#374151', flex: 4 } as FlexText,
      { type: 'text', text: String(value), size: 'sm', weight: 'bold', color, align: 'end', flex: 1 } as FlexText,
    ],
  }
}

export function buildDailySummaryFlex(params: {
  date: string
  newTasks: number
  overdueTasks: number
  courtIn7: number
  absentToday: number
  pendingLeave: number
  todayPayments: number
}): FlexMessage {
  const { date, newTasks, overdueTasks, courtIn7, absentToday, pendingLeave, todayPayments } = params

  const bubble: FlexBubble = {
    type: 'bubble',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#1e3a8a', paddingAll: 'md',
      contents: [
        { type: 'text', text: '📊 สรุปประจำวัน',     color: '#ffffff',  weight: 'bold', size: 'md' } as FlexText,
        { type: 'text', text: date,                    color: '#93c5fd',  size: 'sm' } as FlexText,
      ],
    } as FlexBox,
    body: {
      type: 'box', layout: 'vertical', paddingAll: 'md', spacing: 'sm',
      contents: [
        statRow('📋', 'งานใหม่วันนี้',      newTasks,      '#1e40af'),
        statRow('🚨', 'งานเกินกำหนด',       overdueTasks,  '#ef4444'),
        statRow('⚖️', 'นัดศาลใน 7 วัน',    courtIn7,      '#dc2626'),
        sep(),
        statRow('🏖', 'รออนุมัติลา',         pendingLeave,  '#f59e0b'),
        statRow('💰', 'นัดชำระวันนี้',       todayPayments, '#8b5cf6'),
        statRow('❌', 'ขาดงานวันนี้',        absentToday,   '#64748b'),
      ],
    } as FlexBox,
  }

  return {
    type: 'flex',
    altText: `สรุปวันนี้ ${date} | งาน ${newTasks} เกิน ${overdueTasks} ศาล ${courtIn7}`,
    contents: bubble,
  }
}
