import { prisma } from '@/lib/prisma'
import { pushLineMessages } from '@/lib/line-api'
import { isLineOaConfigured } from '@/lib/line-config'
import {
  FACE_SCAN_TYPE_LABEL,
  getSignedScanImageUrlForLine,
  type FaceScanType,
} from '@/lib/attendance-face-scan'

export type AttendanceLineEvent =
  | 'checkin'
  | 'checkout'
  | 'lunch-out'
  | 'lunch-in'
  | 'face_mismatch'

export type LineNotifyStatus = 'pending' | 'sent' | 'failed'

const LINE_RETRY = 3
const RETRY_DELAY_MS = 1200

const EVENT_LABEL: Record<AttendanceLineEvent, string> = {
  checkin: 'เข้างาน',
  checkout: 'ออกงาน',
  'lunch-out': 'เริ่มพักกลางวัน',
  'lunch-in': 'กลับจากพักกลางวัน',
  face_mismatch: 'ความผิดปกติ (ใบหน้า)',
}

function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
}

function absolutePhotoUrl(path: string | null | undefined): string | null {
  if (!path?.trim()) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const base = appBaseUrl()
  if (!base) return null
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function formatTimeTh(d: Date): string {
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function formatDateDdMmYyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function lateLabel(minutes: number | undefined, event: AttendanceLineEvent): string {
  if (event !== 'checkin') return '—'
  if (!minutes || minutes <= 0) return 'ไม่'
  return `${minutes} นาที`
}

function statusLabelForLine(event: AttendanceLineEvent): string {
  if (event === 'face_mismatch') return EVENT_LABEL[event]
  const key = event as FaceScanType
  return FACE_SCAN_TYPE_LABEL[key] ?? EVENT_LABEL[event]
}

export function buildAttendanceLineMessage(params: {
  event: AttendanceLineEvent
  employeeName: string
  employeeId: string | null
  branchName: string | null
  departmentName: string | null
  location: string | null
  eventTime: Date
  lateMinutes?: number
  earlyLeaveMinutes?: number
  failureDetail?: string
}): string {
  const { event, employeeName, employeeId, branchName, departmentName, location, eventTime } = params

  if (event === 'face_mismatch') {
    return [
      'พบความผิดปกติในการสแกนใบหน้า',
      '',
      `ชื่อ: ${employeeName}`,
      employeeId ? `รหัส: ${employeeId}` : null,
      `วันที่: ${formatDateDdMmYyyy(eventTime)}`,
      `เวลา: ${formatTimeTh(eventTime)}`,
      `ประเภท: ${EVENT_LABEL[event]}`,
      branchName ? `สาขา: ${branchName}` : null,
      departmentName ? `แผนก: ${departmentName}` : null,
      params.failureDetail ? `รายละเอียด: ${params.failureDetail}` : null,
    ]
      .filter(Boolean)
      .join('\n')
  }

  const place = location?.trim() || null
  return [
    'พนักงานลงเวลาแล้ว',
    '',
    `ชื่อ: ${employeeName}`,
    employeeId ? `รหัส: ${employeeId}` : null,
    `ประเภท: ${statusLabelForLine(event)}`,
    `วันที่: ${formatDateDdMmYyyy(eventTime)}`,
    `เวลา: ${formatTimeTh(eventTime)}`,
    `มาสาย: ${lateLabel(params.lateMinutes, event)}`,
    branchName ? `สาขา: ${branchName}` : null,
    departmentName ? `แผนก: ${departmentName}` : null,
    place ? `สถานที่: ${place}` : null,
    event === 'checkout' && params.earlyLeaveMinutes && params.earlyLeaveMinutes > 0
      ? `กลับก่อน: ${params.earlyLeaveMinutes} นาที`
      : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function getHrLineRecipients(): Promise<
  { id: string; name: string; lineUserId: string }[]
> {
  const users = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      role: { in: ['MANAGER_HR', 'ADMIN'] },
      lineUserId: { not: null },
    },
    select: { id: true, name: true, lineUserId: true },
  })
  return users
    .filter((u): u is typeof u & { lineUserId: string } => !!u.lineUserId)
    .map((u) => ({ id: u.id, name: u.name, lineUserId: u.lineUserId }))
}

async function loadEmployeeContext(employeeUserId: string) {
  return prisma.user.findUnique({
    where: { id: employeeUserId },
    select: {
      name: true,
      employeeId: true,
      department: true,
      branch: { select: { name: true } },
      orgDepartment: { select: { name: true } },
      division: { select: { name: true } },
      section: { select: { name: true } },
    },
  })
}

function resolveDepartmentName(
  employee: NonNullable<Awaited<ReturnType<typeof loadEmployeeContext>>>,
): string | null {
  return (
    employee.orgDepartment?.name ??
    employee.department ??
    employee.section?.name ??
    employee.division?.name ??
    null
  )
}

/** ป้องกันส่ง LINE ซ้ำสำหรับ attendance event เดียวกัน */
async function hasDuplicateLineNotify(attendanceId: string, eventType: string): Promise<boolean> {
  const existing = await prisma.attendanceLineNotifyLog.findFirst({
    where: { attendanceId, eventType, status: 'sent' },
    select: { id: true },
  })
  return !!existing
}

function buildLineMessages(text: string, imageUrl: string | null): object[] {
  const messages: object[] = [{ type: 'text', text: text.slice(0, 5000) }]
  if (imageUrl && imageUrl.startsWith('https://')) {
    messages.push({
      type: 'image',
      originalContentUrl: imageUrl,
      previewImageUrl: imageUrl,
    })
  }
  return messages.slice(0, 5)
}

async function pushWithRetry(
  lineUserId: string,
  messages: object[],
): Promise<{ ok: boolean; error?: string }> {
  let lastError: string | undefined
  for (let attempt = 0; attempt < LINE_RETRY; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS * attempt)
    const result = await pushLineMessages(lineUserId, messages)
    if (result.ok) return { ok: true }
    lastError = result.error ?? 'LINE push failed'
  }
  return { ok: false, error: lastError }
}

async function createLogEntry(params: {
  employeeUserId: string
  employeeCode: string | null
  hrLineUserId: string
  eventType: string
  scanType?: string | null
  attendanceId?: string | null
  faceLogId?: string | null
  faceScanId?: string | null
  messageText: string
  photoUrl?: string | null
}) {
  return prisma.attendanceLineNotifyLog.create({
    data: {
      employeeUserId: params.employeeUserId,
      employeeId: params.employeeCode ?? undefined,
      hrLineUserId: params.hrLineUserId,
      eventType: params.eventType,
      scanType: params.scanType ?? params.eventType,
      attendanceId: params.attendanceId ?? undefined,
      faceLogId: params.faceLogId ?? undefined,
      faceScanId: params.faceScanId ?? undefined,
      messageText: params.messageText,
      photoUrl: params.photoUrl ?? undefined,
      status: 'pending',
    },
  })
}

async function resolveLineImageUrl(params: {
  faceScanId?: string | null
  photoUrl?: string | null
}): Promise<string | null> {
  if (params.faceScanId) {
    const signed = await getSignedScanImageUrlForLine(params.faceScanId)
    if (signed?.startsWith('https://')) return signed
  }
  const path = params.photoUrl?.trim()
  if (path && path.includes('/') && !path.startsWith('http') && !path.startsWith('/uploads')) {
    const { getSignedUrl } = await import('@/lib/cloudinary-service')
    const signed = getSignedUrl(path)
    if (signed?.startsWith('https://')) return signed
  }
  return absolutePhotoUrl(params.photoUrl)
}

async function deliverToHrRecipient(params: {
  logId: string
  hrLineUserId: string
  messages: object[]
  retryCountStart: number
}): Promise<void> {
  const push = await pushWithRetry(params.hrLineUserId, params.messages)
  if (push.ok) {
    await prisma.attendanceLineNotifyLog.update({
      where: { id: params.logId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        failedReason: null,
        retryCount: params.retryCountStart + LINE_RETRY,
      },
    })
    return
  }

  const reason = push.error?.slice(0, 500) ?? 'unknown'
  console.error('[attendance-line-notify] LINE push failed', {
    logId: params.logId,
    hrLineUserId: params.hrLineUserId,
    reason,
  })
  await prisma.attendanceLineNotifyLog.update({
    where: { id: params.logId },
    data: {
      status: 'failed',
      failedReason: reason,
      retryCount: params.retryCountStart + LINE_RETRY,
    },
  })
}

/** ส่งแจ้ง HR ทาง LINE — ไม่ throw (เรียกแบบ fire-and-forget ได้) */
export async function notifyHrAttendanceOnLine(params: {
  event: AttendanceLineEvent
  employeeUserId: string
  attendanceId?: string | null
  faceLogId?: string | null
  faceScanId?: string | null
  photoUrl?: string | null
  eventTime?: Date
  location?: string | null
  lateMinutes?: number
  earlyLeaveMinutes?: number
  failureDetail?: string
}): Promise<{ sent: number; failed: number }> {
  if (!isLineOaConfigured()) {
    console.warn('[attendance-line-notify] LINE OA not configured — skip push')
    return { sent: 0, failed: 0 }
  }

  const hrUsers = await getHrLineRecipients()
  if (hrUsers.length === 0) {
    console.warn('[attendance-line-notify] no HR/Admin with linked LINE — skip push')
    return { sent: 0, failed: 0 }
  }

  if (params.attendanceId && params.event !== 'face_mismatch') {
    const dup = await hasDuplicateLineNotify(params.attendanceId, params.event)
    if (dup) {
      console.info('[attendance-line-notify] duplicate skipped', {
        attendanceId: params.attendanceId,
        event: params.event,
      })
      return { sent: 0, failed: 0 }
    }
  }

  const employee = await loadEmployeeContext(params.employeeUserId)
  if (!employee) {
    console.warn('[attendance-line-notify] employee not found', { userId: params.employeeUserId })
    return { sent: 0, failed: 0 }
  }

  const eventTime = params.eventTime ?? new Date()
  const departmentName = resolveDepartmentName(employee)
  const messageText = buildAttendanceLineMessage({
    event: params.event,
    employeeName: employee.name,
    employeeId: employee.employeeId,
    branchName: employee.branch?.name ?? null,
    departmentName,
    location: params.location ?? null,
    eventTime,
    lateMinutes: params.lateMinutes,
    earlyLeaveMinutes: params.earlyLeaveMinutes,
    failureDetail: params.failureDetail,
  })

  const imageUrl = await resolveLineImageUrl({
    faceScanId: params.faceScanId,
    photoUrl: params.photoUrl,
  })
  const messages = buildLineMessages(messageText, imageUrl)

  let sent = 0
  let failed = 0

  for (const hr of hrUsers) {
    const log = await createLogEntry({
      employeeUserId: params.employeeUserId,
      employeeCode: employee.employeeId,
      hrLineUserId: hr.lineUserId,
      eventType: params.event,
      scanType: params.event,
      attendanceId: params.attendanceId,
      faceLogId: params.faceLogId,
      faceScanId: params.faceScanId,
      messageText,
      photoUrl: imageUrl ?? params.photoUrl,
    })

    await deliverToHrRecipient({
      logId: log.id,
      hrLineUserId: hr.lineUserId,
      messages,
      retryCountStart: 0,
    })

    const updated = await prisma.attendanceLineNotifyLog.findUnique({
      where: { id: log.id },
      select: { status: true },
    })
    if (updated?.status === 'sent') sent++
    else failed++
  }

  return { sent, failed }
}

export async function notifyHrFaceMismatchOnLine(params: {
  employeeUserId: string
  action: string
  faceLogId?: string | null
  failureReason: string
  photoUrl?: string | null
}): Promise<void> {
  const detail =
    params.failureReason === 'security_face_mismatch' || params.failureReason === 'face_mismatch'
      ? 'ใบหน้าไม่ตรงกับที่ลงทะเบียน'
      : params.failureReason === 'spoof_detected'
        ? 'ตรวจพบ spoof / ไม่ใช่กล้องสด'
        : params.failureReason

  await notifyHrAttendanceOnLine({
    event: 'face_mismatch',
    employeeUserId: params.employeeUserId,
    faceLogId: params.faceLogId,
    photoUrl: params.photoUrl,
    eventTime: new Date(),
    failureDetail: detail,
  })
}

export async function retryFailedAttendanceLineNotify(logId: string): Promise<{
  ok: boolean
  error?: string
}> {
  const log = await prisma.attendanceLineNotifyLog.findUnique({ where: { id: logId } })
  if (!log) return { ok: false, error: 'ไม่พบ log' }
  if (log.status === 'sent') return { ok: true }

  const imageUrl = await resolveLineImageUrl({
    faceScanId: log.faceScanId,
    photoUrl: log.photoUrl,
  })
  const messages = buildLineMessages(log.messageText, imageUrl)

  await prisma.attendanceLineNotifyLog.update({
    where: { id: logId },
    data: { status: 'pending', failedReason: null },
  })

  await deliverToHrRecipient({
    logId,
    hrLineUserId: log.hrLineUserId,
    messages,
    retryCountStart: log.retryCount,
  })

  const updated = await prisma.attendanceLineNotifyLog.findUnique({
    where: { id: logId },
    select: { status: true, failedReason: true },
  })

  if (updated?.status === 'sent') return { ok: true }
  return { ok: false, error: updated?.failedReason ?? 'ส่งไม่สำเร็จ' }
}

/** Helper หลังบันทึก attendance สำเร็จ */
export function scheduleHrAttendanceLineNotify(params: {
  event: AttendanceLineEvent
  employeeUserId: string
  attendanceId: string
  faceScanId?: string | null
  photoUrl?: string | null
  eventTime: Date
  location?: string | null
  lateMinutes?: number
  earlyLeaveMinutes?: number
}): void {
  void notifyHrAttendanceOnLine({
    event: params.event,
    employeeUserId: params.employeeUserId,
    attendanceId: params.attendanceId,
    faceScanId: params.faceScanId,
    photoUrl: params.photoUrl,
    eventTime: params.eventTime,
    location: params.location,
    lateMinutes: params.lateMinutes,
    earlyLeaveMinutes: params.earlyLeaveMinutes,
  }).catch((err) => console.error('[attendance-line-notify]', err))
}
