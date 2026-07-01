import { prisma } from '@/lib/prisma'
import { pushLineMessages } from '@/lib/line-api'
import { isLineOaConfiguredAsync } from '@/lib/line-config'
import {
  formatDateDdMmYyyyBangkok,
  formatTimeBangkok,
} from '@/lib/datetime-bangkok'
import {
  FACE_SCAN_TYPE_LABEL,
  getSignedScanImageUrlForLine,
  type FaceScanType,
} from '@/lib/attendance-face-scan'
import { getHrLineRecipients } from '@/lib/attendance-line-recipients'

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

function lateStatusLabel(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) return 'ตรงเวลา'
  return 'มาสาย'
}

function lateMinutesLabel(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) return '—'
  if (minutes < 60) return `${minutes} นาที`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} ชั่วโมง ${m} นาที` : `${h} ชั่วโมง`
}

function checkoutStatusLabel(earlyLeaveMinutes: number | undefined): string {
  if (!earlyLeaveMinutes || earlyLeaveMinutes <= 0) return 'เลิกงานปกติ'
  return 'กลับก่อนเวลา'
}

function statusLabelForLine(event: AttendanceLineEvent): string {
  if (event === 'face_mismatch') return EVENT_LABEL[event]
  const key = event as FaceScanType
  return FACE_SCAN_TYPE_LABEL[key] ?? EVENT_LABEL[event]
}

function googleMapsLink(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`
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
  isOutside?: boolean
  lat?: number | null
  lng?: number | null
}): string {
  const { event, employeeName, employeeId, branchName, departmentName, location, eventTime } = params
  const isOffsite = params.isOutside === true

  if (event === 'face_mismatch') {
    return [
      'พบความผิดปกติในการสแกนใบหน้า',
      '',
      `ชื่อ: ${employeeName}`,
      employeeId ? `รหัส: ${employeeId}` : null,
      `วันที่: ${formatDateDdMmYyyyBangkok(eventTime)}`,
      `เวลา: ${formatTimeBangkok(eventTime)}`,
      `ประเภท: ${EVENT_LABEL[event]}`,
      branchName ? `สาขา: ${branchName}` : null,
      departmentName ? `แผนก: ${departmentName}` : null,
      params.failureDetail ? `รายละเอียด: ${params.failureDetail}` : null,
    ]
      .filter(Boolean)
      .join('\n')
  }

  const place = location?.trim() || null
  const mapsUrl =
    params.lat != null && params.lng != null
      ? googleMapsLink(params.lat, params.lng)
      : null

  const header = isOffsite ? 'พนักงานลงเวลานอกสถานที่' : 'พนักงานลงเวลาแล้ว'
  const locationBlock = [
    place,
    mapsUrl ? `📍 ${mapsUrl}` : null,
  ].filter((v): v is string => Boolean(v)).join('\n')

  return [
    header,
    '',
    `ชื่อ: ${employeeName}`,
    employeeId ? `รหัส: ${employeeId}` : null,
    '',
    'ประเภท:',
    statusLabelForLine(event),
    '',
    'วันที่:',
    formatDateDdMmYyyyBangkok(eventTime),
    '',
    'เวลา:',
    formatTimeBangkok(eventTime),
    // สถานะมาสาย (เฉพาะ checkin)
    event === 'checkin' ? '' : null,
    event === 'checkin' ? 'สถานะ:' : null,
    event === 'checkin' ? lateStatusLabel(params.lateMinutes) : null,
    event === 'checkin' && params.lateMinutes && params.lateMinutes > 0 ? '' : null,
    event === 'checkin' && params.lateMinutes && params.lateMinutes > 0 ? 'สาย:' : null,
    event === 'checkin' && params.lateMinutes && params.lateMinutes > 0
      ? lateMinutesLabel(params.lateMinutes) : null,
    isOffsite ? '\nสถานที่ทำงาน: นอกสถานที่' : null,
    // สถานะเลิกงาน (เฉพาะ checkout)
    event === 'checkout' ? '' : null,
    event === 'checkout' ? 'สถานะ:' : null,
    event === 'checkout' ? checkoutStatusLabel(params.earlyLeaveMinutes) : null,
    event === 'checkout' && params.earlyLeaveMinutes && params.earlyLeaveMinutes > 0 ? '' : null,
    event === 'checkout' && params.earlyLeaveMinutes && params.earlyLeaveMinutes > 0 ? 'กลับก่อน:' : null,
    event === 'checkout' && params.earlyLeaveMinutes && params.earlyLeaveMinutes > 0
      ? `${params.earlyLeaveMinutes} นาที` : null,
    branchName ? `\nสาขา: ${branchName}` : null,
    departmentName ? `แผนก/ฝ่าย: ${departmentName}` : null,
    locationBlock ? `\nสถานที่:\n${locationBlock}` : null,
  ]
    .filter((v): v is string => v !== null && v !== undefined)
    .join('\n')
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

/** ป้องกันส่ง LINE ซ้ำต่อ HR คนเดียว + event เดียวกัน */
async function findLineNotifyLogForRecipient(
  attendanceId: string,
  eventType: string,
  hrLineUserId: string,
) {
  return prisma.attendanceLineNotifyLog.findFirst({
    where: { attendanceId, eventType, hrLineUserId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, retryCount: true },
  })
}

function buildLineTextMessage(text: string): object {
  return { type: 'text', text: text.slice(0, 5000) }
}

function buildLineImageMessage(imageUrl: string): object | null {
  if (!imageUrl.startsWith('https://')) return null
  return {
    type: 'image',
    originalContentUrl: imageUrl,
    previewImageUrl: imageUrl,
  }
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
  imageUrl?: string | null
}) {
  const url = params.imageUrl ?? params.photoUrl ?? undefined
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
      photoUrl: url,
      imageUrl: url,
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

/** ส่งข้อความ (เวลา/รายละเอียด) ก่อน แล้วส่งรูปแยก — HR ได้เวลาแม้รูปล้ม */
async function deliverToHrRecipient(params: {
  logId: string
  hrLineUserId: string
  messageText: string
  imageUrl: string | null
  retryCountStart: number
}): Promise<void> {
  const textPush = await pushWithRetry(params.hrLineUserId, [
    buildLineTextMessage(params.messageText),
  ])

  if (!textPush.ok) {
    const reason = textPush.error?.slice(0, 500) ?? 'LINE text push failed'
    console.error('[attendance-line-notify] LINE text failed', {
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
    return
  }

  let imageWarning: string | null = null
  const imageMsg = params.imageUrl ? buildLineImageMessage(params.imageUrl) : null
  if (imageMsg) {
    const imgPush = await pushWithRetry(params.hrLineUserId, [imageMsg])
    if (!imgPush.ok) {
      imageWarning = `รูปส่งไม่สำเร็จ: ${imgPush.error?.slice(0, 400) ?? 'unknown'}`
      console.warn('[attendance-line-notify] LINE image failed (text sent)', {
        logId: params.logId,
        imageUrl: params.imageUrl?.slice(0, 80),
        error: imgPush.error,
      })
    }
  } else if (params.imageUrl) {
    imageWarning = 'ไม่มี URL รูปที่ LINE ใช้ได้ (ต้องเป็น https)'
  }

  await prisma.attendanceLineNotifyLog.update({
    where: { id: params.logId },
    data: {
      status: 'sent',
      sentAt: new Date(),
      failedReason: imageWarning,
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
  isOutside?: boolean
  lat?: number | null
  lng?: number | null
}): Promise<{ sent: number; failed: number }> {
  if (!(await isLineOaConfiguredAsync())) {
    console.warn('[attendance-line-notify] LINE OA not configured — skip push')
    return { sent: 0, failed: 1 }
  }

  const hrUsers = await getHrLineRecipients()

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
    isOutside: params.isOutside,
    lat: params.lat,
    lng: params.lng,
  })

  const imageUrl = await resolveLineImageUrl({
    faceScanId: params.faceScanId,
    photoUrl: params.photoUrl,
  })
  let sent = 0
  let failed = 0

  for (const hr of hrUsers) {
    let logId: string
    let retryCountStart = 0

    if (params.attendanceId && params.event !== 'face_mismatch') {
      const existing = await findLineNotifyLogForRecipient(
        params.attendanceId,
        params.event,
        hr.lineUserId,
      )
      if (existing?.status === 'sent') {
        console.info('[attendance-line-notify] duplicate skipped', {
          attendanceId: params.attendanceId,
          event: params.event,
          hrLineUserId: hr.lineUserId,
        })
        continue
      }
      if (existing && (existing.status === 'pending' || existing.status === 'failed')) {
        logId = existing.id
        retryCountStart = existing.retryCount
        await prisma.attendanceLineNotifyLog.update({
          where: { id: logId },
          data: {
            status: 'pending',
            failedReason: null,
            messageText,
            photoUrl: imageUrl ?? params.photoUrl ?? undefined,
            imageUrl: imageUrl ?? params.photoUrl ?? undefined,
            faceScanId: params.faceScanId ?? undefined,
          },
        })
      } else {
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
          imageUrl: imageUrl ?? params.photoUrl,
        })
        logId = log.id
      }
    } else {
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
        imageUrl: imageUrl ?? params.photoUrl,
      })
      logId = log.id
    }

    await deliverToHrRecipient({
      logId,
      hrLineUserId: hr.lineUserId,
      messageText,
      imageUrl,
      retryCountStart,
    })

    const updated = await prisma.attendanceLineNotifyLog.findUnique({
      where: { id: logId },
      select: { status: true },
    })
    if (updated?.status === 'sent') sent++
    else failed++
  }

  // Broadcast fallback — ถ้าไม่มี HR linked หรือทุกคน fail
  if (hrUsers.length === 0 || (sent === 0 && failed > 0)) {
    try {
      const { resolveLineChannelAccessToken } = await import('@/lib/line-credentials')
      const resolved = await resolveLineChannelAccessToken()
      if (resolved.token) {
        const msgs: object[] = [{ type: 'text', text: messageText }]
        if (imageUrl) msgs.push({ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl })
        const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resolved.token },
          body: JSON.stringify({ messages: msgs }),
        })
        if (res.ok) { sent = 1; failed = 0 }
        else console.warn('[attendance-line-notify] broadcast fallback failed', res.status)
      }
    } catch (err) {
      console.error('[attendance-line-notify] broadcast fallback error', err)
    }
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
    photoUrl: log.imageUrl ?? log.photoUrl,
  })

  await prisma.attendanceLineNotifyLog.update({
    where: { id: logId },
    data: { status: 'pending', failedReason: null },
  })

  await deliverToHrRecipient({
    logId,
    hrLineUserId: log.hrLineUserId,
    messageText: log.messageText,
    imageUrl,
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
