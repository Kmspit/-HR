import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createScanImageAccessToken, signedScanImageUrl } from '@/lib/attendance-scan-access'
import type { AttendanceLineEvent } from '@/lib/attendance-line-notify'

const MAX_IMAGE_BYTES = 900_000

export type FaceScanType = 'checkin' | 'checkout' | 'lunch-out' | 'lunch-in'

export const FACE_SCAN_TYPE_LABEL: Record<FaceScanType, string> = {
  checkin: 'Check In',
  checkout: 'Check Out',
  'lunch-out': 'Start Lunch',
  'lunch-in': 'End Lunch',
}

export type SaveFaceScanInput = {
  userId: string
  scanType: FaceScanType
  scanTime?: Date
  attendanceId?: string | null
  faceLogId?: string | null
  confidenceScore?: number | null
  matchScore?: number | null
  livenessScore?: number | null
  matched?: boolean
  imageBuffer: Buffer
  imageMime?: string
  locationName?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  deviceInfo?: string | null
}

function bufferToBase64(buf: Buffer): string {
  return buf.toString('base64')
}

function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, 'base64')
}

export function parseDeviceInfoFromHeaders(headers: Headers): string {
  const ua = headers.get('user-agent') ?? 'unknown'
  const platform = headers.get('sec-ch-ua-platform') ?? ''
  return JSON.stringify({
    userAgent: ua.slice(0, 400),
    platform: platform.slice(0, 80),
  })
}

export async function saveAttendanceFaceScan(input: SaveFaceScanInput): Promise<string | null> {
  if (!input.imageBuffer?.length) return null
  if (input.imageBuffer.length > MAX_IMAGE_BYTES) {
    console.warn('[face-scan] image too large, skipped', input.imageBuffer.length)
    return null
  }

  const mime = input.imageMime ?? 'image/jpeg'
  const record = await prisma.attendanceFaceScan.create({
    data: {
      userId: input.userId,
      scanType: input.scanType,
      scanTime: input.scanTime ?? new Date(),
      attendanceId: input.attendanceId ?? undefined,
      faceLogId: input.faceLogId ?? undefined,
      confidenceScore: input.confidenceScore ?? undefined,
      matchScore: input.matchScore ?? undefined,
      livenessScore: input.livenessScore ?? undefined,
      matched: input.matched ?? true,
      imageMime: mime,
      imageData: bufferToBase64(input.imageBuffer),
      locationName: input.locationName ?? undefined,
      address: input.address ?? undefined,
      lat: input.lat ?? undefined,
      lng: input.lng ?? undefined,
      deviceInfo: input.deviceInfo ?? undefined,
    },
  })

  return record.id
}

export async function getFaceScanImageBuffer(scanId: string): Promise<{
  buffer: Buffer
  mime: string
} | null> {
  const row = await prisma.attendanceFaceScan.findUnique({
    where: { id: scanId },
    select: { imageData: true, imageMime: true },
  })
  if (!row?.imageData) return null
  return { buffer: base64ToBuffer(row.imageData), mime: row.imageMime ?? 'image/jpeg' }
}

export async function getSignedScanImageUrlForLine(scanId: string): Promise<string | null> {
  const base =
    (process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '') ||
    null
  if (!base) return null
  const token = await createScanImageAccessToken(scanId)
  return signedScanImageUrl(scanId, base, token)
}

export async function imageBufferFromForm(
  formData: FormData,
  fieldNames = ['faceScanImage', 'photo'],
): Promise<{ buffer: Buffer; mime: string } | null> {
  for (const name of fieldNames) {
    const file = formData.get(name)
    if (file instanceof File && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer())
      return { buffer, mime: file.type || 'image/jpeg' }
    }
  }
  const b64 = formData.get('faceScanImageBase64')
  if (typeof b64 === 'string' && b64.startsWith('data:image')) {
    const m = /^data:(image\/\w+);base64,(.+)$/.exec(b64)
    if (m) {
      return { buffer: Buffer.from(m[2], 'base64'), mime: m[1] }
    }
  }
  return null
}

export async function persistFaceScanFromAttendanceForm(params: {
  formData: FormData
  userId: string
  scanType: FaceScanType
  attendanceId?: string | null
  faceLogId?: string | null
  locationName?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  deviceInfo?: string | null
  confidenceScore?: number | null
  matchScore?: number | null
  livenessScore?: number | null
  matched?: boolean
}): Promise<string | null> {
  const img = await imageBufferFromForm(params.formData)
  if (!img) return null

  return saveAttendanceFaceScan({
    userId: params.userId,
    scanType: params.scanType,
    attendanceId: params.attendanceId,
    faceLogId: params.faceLogId,
    imageBuffer: img.buffer,
    imageMime: img.mime,
    locationName: params.locationName,
    address: params.address,
    lat: params.lat,
    lng: params.lng,
    deviceInfo: params.deviceInfo,
    confidenceScore: params.confidenceScore,
    matchScore: params.matchScore,
    livenessScore: params.livenessScore,
    matched: params.matched,
  })
}

export function formHasFaceImage(formData: FormData): boolean {
  const photo = formData.get('photo')
  if (photo instanceof File && photo.size > 0) return true
  const b64 = formData.get('faceScanImageBase64')
  return typeof b64 === 'string' && b64.startsWith('data:image')
}

function parseScoresFromForm(formData: FormData) {
  const detectionScore = Number(formData.get('detectionScore') ?? NaN)
  const livenessScore = Number(formData.get('livenessScore') ?? NaN)
  const matchScore = Number(formData.get('faceMatchScore') ?? NaN)
  const confidenceScore = Number(formData.get('faceConfidence') ?? NaN)
  return {
    detectionScore: Number.isFinite(detectionScore) ? detectionScore : null,
    livenessScore: Number.isFinite(livenessScore) ? livenessScore : null,
    matchScore: Number.isFinite(matchScore) ? matchScore : null,
    confidenceScore: Number.isFinite(confidenceScore) ? confidenceScore : null,
  }
}

/** บันทึกรูปสแกน + แจ้ง LINE HR หลังลงเวลาสำเร็จ */
export async function recordFaceScanAndNotifyHr(params: {
  req: NextRequest
  formData: FormData
  userId: string
  scanType: FaceScanType
  attendanceId: string
  faceLogId?: string | null
  event: AttendanceLineEvent
  eventTime: Date
  location?: string | null
  locationName?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  photoUrl?: string | null
  lateMinutes?: number
  earlyLeaveMinutes?: number
}): Promise<string | null> {
  const scores = parseScoresFromForm(params.formData)
  const faceScanId = await persistFaceScanFromAttendanceForm({
    formData: params.formData,
    userId: params.userId,
    scanType: params.scanType,
    attendanceId: params.attendanceId,
    faceLogId: params.faceLogId,
    locationName: params.locationName ?? params.location,
    address: params.address,
    lat: params.lat,
    lng: params.lng,
    deviceInfo: parseDeviceInfoFromHeaders(params.req.headers),
    confidenceScore: scores.confidenceScore ?? scores.detectionScore,
    matchScore: scores.matchScore,
    livenessScore: scores.livenessScore,
    matched: true,
  })

  const { scheduleHrAttendanceLineNotify } = await import('@/lib/attendance-line-notify')
  scheduleHrAttendanceLineNotify({
    event: params.event,
    employeeUserId: params.userId,
    attendanceId: params.attendanceId,
    faceScanId,
    photoUrl: params.photoUrl,
    eventTime: params.eventTime,
    location: params.location,
    lateMinutes: params.lateMinutes,
    earlyLeaveMinutes: params.earlyLeaveMinutes,
  })

  return faceScanId
}
