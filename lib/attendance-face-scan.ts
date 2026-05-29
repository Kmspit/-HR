import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createScanImageAccessToken, signedScanImageUrl } from '@/lib/attendance-scan-access'
import type { AttendanceLineEvent } from '@/lib/attendance-line-notify'
import {
  attendanceScanFolder,
  fetchImageBuffer,
  getSignedUrl,
  isCloudinaryConfigured,
  loadUserImageContext,
  uploadImage,
  type UserImageContext,
} from '@/lib/cloudinary-service'

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
    console.warn('[face-scan] image too large', input.imageBuffer.length)
    return null
  }

  if (!isCloudinaryConfigured()) {
    console.warn('[face-scan] Cloudinary not configured — skip image upload')
    return null
  }

  const mime = input.imageMime ?? 'image/jpeg'
  const scanTime = input.scanTime ?? new Date()
  const ctx = await loadUserImageContext(input.userId)
  const folder = attendanceScanFolder(ctx, input.scanType)

  const record = await prisma.attendanceFaceScan.create({
    data: {
      userId: input.userId,
      employeeId: ctx.employeeId,
      companyId: ctx.branchId,
      branchId: ctx.branchId,
      scanType: input.scanType,
      scanTime,
      attendanceId: input.attendanceId ?? undefined,
      faceLogId: input.faceLogId ?? undefined,
      confidenceScore: input.confidenceScore ?? undefined,
      matchScore: input.matchScore ?? undefined,
      livenessScore: input.livenessScore ?? undefined,
      faceMatched: input.matched ?? true,
      matched: input.matched ?? true,
      imageMime: mime,
      locationName: input.locationName ?? undefined,
      location: input.locationName ?? undefined,
      address: input.address ?? undefined,
      lat: input.lat ?? undefined,
      lng: input.lng ?? undefined,
      latitude: input.lat ?? undefined,
      longitude: input.lng ?? undefined,
      deviceInfo: input.deviceInfo ?? undefined,
      storageProvider: 'cloudinary',
      imageData: '',
    },
  })

  const uploaded = await uploadImage(input.imageBuffer, {
    folder,
    publicId: `${input.scanType}_${record.id}`,
    mime,
  })

  await prisma.attendanceFaceScan.update({
    where: { id: record.id },
    data: {
      cloudinaryPublicId: uploaded.publicId,
      objectKey: uploaded.publicId,
      imageUrl: uploaded.imageUrl,
      secureUrl: uploaded.secureUrl,
      format: uploaded.format,
      fileSize: uploaded.fileSize,
      width: uploaded.width,
      height: uploaded.height,
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
    select: {
      cloudinaryPublicId: true,
      objectKey: true,
      imageMime: true,
      format: true,
      imageData: true,
      storageProvider: true,
    },
  })
  if (!row) return null

  const publicId = row.cloudinaryPublicId ?? row.objectKey
  if (publicId) {
    const fromCloud = await fetchImageBuffer(publicId)
    if (fromCloud) return fromCloud
  }

  if (row.imageData?.length > 100 && row.storageProvider === 'db') {
    return {
      buffer: Buffer.from(row.imageData, 'base64'),
      mime: row.imageMime ?? `image/${row.format ?? 'jpeg'}`,
    }
  }

  return null
}

export async function getSignedScanImageUrlForLine(scanId: string): Promise<string | null> {
  const row = await prisma.attendanceFaceScan.findUnique({
    where: { id: scanId },
    select: {
      cloudinaryPublicId: true,
      objectKey: true,
      format: true,
      secureUrl: true,
      imageUrl: true,
    },
  })

  const publicId = row?.cloudinaryPublicId ?? row?.objectKey
  if (publicId) {
    const { optimizeImage } = await import('@/lib/cloudinary-service')
    const delivery = optimizeImage(publicId, {
      width: 1024,
      expiresInSec: 60 * 60,
    })
    if (delivery?.startsWith('https://')) return delivery

    const signed = getSignedUrl(publicId, {
      format: row?.format ?? 'jpg',
      expiresInSec: 60 * 60,
    })
    if (signed?.startsWith('https://')) return signed
  }

  const stored = row?.secureUrl ?? row?.imageUrl
  if (stored?.startsWith('https://')) return stored

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

/** อัปโหลดรูป attendance ทั่วไป (checkin photo field) → คืน public_id สำหรับเก็บใน attendance.photoUrl */
export async function uploadAttendancePhotoToCloudinary(params: {
  userId: string
  scanType: FaceScanType
  buffer: Buffer
  mime: string
  suffix?: string
}): Promise<string | null> {
  if (!isCloudinaryConfigured()) return null
  try {
    const ctx = await loadUserImageContext(params.userId)
    const folder = attendanceScanFolder(ctx, params.scanType)
    const uploaded = await uploadImage(params.buffer, {
      folder,
      publicId: `photo_${params.suffix ?? Date.now()}`,
      mime: params.mime,
    })
    return uploaded.publicId
  } catch (err) {
    console.error('[attendance-photo-cloudinary]', err)
    return null
  }
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

export async function syncAttendancePhotoFromFaceScan(
  attendanceId: string,
  faceScanId: string | null,
  field: 'photoUrl' | 'checkOutPhotoUrl' | 'lunchOutPhotoUrl' | 'lunchInPhotoUrl',
): Promise<string | null> {
  if (!faceScanId) return null
  const scan = await prisma.attendanceFaceScan.findUnique({
    where: { id: faceScanId },
    select: { cloudinaryPublicId: true },
  })
  const publicId = scan?.cloudinaryPublicId
  if (!publicId) return null
  await prisma.attendance.update({
    where: { id: attendanceId },
    data: { [field]: publicId },
  })
  return publicId
}

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
}): Promise<{
  faceScanId: string | null
  lineNotify: { sent: number; failed: number }
}> {
  const scores = parseScoresFromForm(params.formData)
  let faceScanId: string | null = null
  let lineNotify = { sent: 0, failed: 0 }
  try {
    faceScanId = await persistFaceScanFromAttendanceForm({
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
  } catch (err) {
    console.error('[face-scan-persist]', err)
  }

  // ส่ง LINE HR ทันทีหลังอัปโหลด Cloudinary — ไม่ throw (attendance บันทึกแล้ว)
  try {
    let lineImageUrl: string | null = null
    if (faceScanId) {
      lineImageUrl = await getSignedScanImageUrlForLine(faceScanId)
    }
    const { notifyHrAttendanceOnLine } = await import('@/lib/attendance-line-notify')
    lineNotify = await notifyHrAttendanceOnLine({
      event: params.event,
      employeeUserId: params.userId,
      attendanceId: params.attendanceId,
      faceScanId,
      photoUrl: lineImageUrl ?? params.photoUrl,
      eventTime: params.eventTime,
      location: params.location ?? params.locationName,
      lateMinutes: params.lateMinutes,
      earlyLeaveMinutes: params.earlyLeaveMinutes,
    })
    if (lineNotify.failed > 0) {
      console.warn('[attendance-line-notify] partial LINE failure', {
        attendanceId: params.attendanceId,
        event: params.event,
        sent: lineNotify.sent,
        failed: lineNotify.failed,
      })
    }
  } catch (err) {
    console.error('[attendance-line-notify]', err)
  }

  return { faceScanId, lineNotify }
}
