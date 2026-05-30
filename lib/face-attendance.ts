import { prisma } from '@/lib/prisma'
import { decryptFaceDescriptor, encryptFaceDescriptor } from '@/lib/face-crypto'
import {
  averageDescriptors,
  faceDescriptorDistance,
  isFaceMatch,
  parseDescriptorPayload,
  FACE_MATCH_THRESHOLD,
} from '@/lib/face-match'
import { countRecentFaceMismatches, notifyFaceSecurityAlert } from '@/lib/face-security'

export type FaceVerifyInput = {
  userId: string
  liveDescriptor: number[]
  livenessScore: number
  detectionScore?: number
  action: string
  method: 'face' | 'manual'
  attendanceId?: string | null
  spoofFlags?: string | null
}

const MIN_DETECTION_SCORE = 0.4  // ลดจาก 0.5 ให้ตรงกับ detector scoreThreshold

export const ATTENDANCE_FACE_ACTIONS = [
  'checkin',
  'checkout',
  'lunch-out',
  'lunch-in',
] as const

export type AttendanceFaceAction = (typeof ATTENDANCE_FACE_ACTIONS)[number]

export function isAttendanceFaceAction(action: string): action is AttendanceFaceAction {
  return (ATTENDANCE_FACE_ACTIONS as readonly string[]).includes(action)
}

export async function userHasFaceProfile(userId: string): Promise<boolean> {
  const p = await prisma.userFaceProfile.findUnique({ where: { userId }, select: { id: true } })
  return !!p
}

export async function getFaceRegistrationStatus(userId: string) {
  const profile = await prisma.userFaceProfile.findUnique({ where: { userId } })
  return {
    registered: !!profile,
    registeredAt: profile?.registeredAt?.toISOString() ?? null,
    modelVersion: profile?.modelVersion ?? null,
    sampleCount: profile?.sampleCount ?? 0,
  }
}

export async function registerFaceProfile(
  userId: string,
  samples: number[][],
  livenessScore: number,
  registrationImage?: { buffer: Buffer; mime: string } | null,
) {
  if (samples.length < 1) throw new Error('NO_SAMPLES')

  const merged = samples.length === 1 ? samples[0] : averageDescriptors(samples)
  const encryptedDescriptor = encryptFaceDescriptor(merged)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employeeId: true },
  })

  let cloudinaryPublicId: string | undefined
  let faceImageUrl: string | undefined
  let secureUrl: string | undefined

  if (registrationImage?.buffer?.length) {
    try {
      const {
        faceRegistrationFolder,
        isCloudinaryConfigured,
        loadUserImageContext,
        uploadImage,
      } = await import('@/lib/cloudinary-service')
      if (isCloudinaryConfigured()) {
        const ctx = await loadUserImageContext(userId)
        const uploaded = await uploadImage(registrationImage.buffer, {
          folder: faceRegistrationFolder(ctx),
          publicId: 'registration',
          mime: registrationImage.mime,
        })
        cloudinaryPublicId = uploaded.publicId
        faceImageUrl = uploaded.imageUrl
        secureUrl = uploaded.secureUrl
      }
    } catch (err) {
      console.error('[face-register-image]', err)
    }
  }

  const profile = await prisma.userFaceProfile.upsert({
    where: { userId },
    create: {
      userId,
      employeeId: user?.employeeId ?? undefined,
      encryptedDescriptor,
      faceEmbedding: encryptedDescriptor,
      cloudinaryPublicId,
      faceImageUrl,
      secureUrl,
      isActive: true,
      sampleCount: samples.length,
      modelVersion: 'face-api-tiny-v1',
    },
    update: {
      employeeId: user?.employeeId ?? undefined,
      encryptedDescriptor,
      faceEmbedding: encryptedDescriptor,
      ...(cloudinaryPublicId
        ? { cloudinaryPublicId, faceImageUrl, secureUrl, isActive: true }
        : {}),
      sampleCount: samples.length,
      modelVersion: 'face-api-tiny-v1',
    },
  })

  await logFaceEvent({
    userId,
    action: 'register',
    method: 'face',
    matched: true,
    matchScore: 0,
    confidenceScore: 1,
    livenessScore,
    spoofFlags: null,
    failureReason: null,
    attendanceId: null,
    securityEvent: false,
  })

  return profile
}

async function handleSecurityFailure(params: {
  userId: string
  action: string
  failureReason: string
  logId: string
  distance?: number | null
}) {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { name: true },
  })
  await notifyFaceSecurityAlert({
    userId: params.userId,
    userName: user?.name ?? params.userId,
    action: params.action,
    failureReason: params.failureReason,
    logId: params.logId,
    distance: params.distance,
  })
}

export async function verifyFaceForAttendance(input: FaceVerifyInput) {
  const {
    userId,
    liveDescriptor,
    livenessScore,
    detectionScore = 0,
    action,
    method,
    attendanceId,
    spoofFlags,
  } = input

  if (method === 'manual') {
    const hasProfile = await userHasFaceProfile(userId)
    if (hasProfile) {
      const log = await logFaceEvent({
        userId,
        action,
        method: 'manual',
        matched: false,
        matchScore: null,
        confidenceScore: null,
        livenessScore: null,
        spoofFlags: spoofFlags ?? 'manual_bypass_blocked',
        failureReason: 'face_required',
        attendanceId: attendanceId ?? null,
        securityEvent: true,
      })
      await handleSecurityFailure({
        userId,
        action,
        failureReason: 'face_required',
        logId: log.id,
      })
      return {
        ok: false as const,
        logId: log.id,
        error: 'ต้องสแกนใบหน้าเพื่อยืนยันตัวตน — ไม่อนุญาตโหมดถ่ายรูปอย่างเดียว',
        code: 'FACE_REQUIRED',
      }
    }

    const log = await logFaceEvent({
      userId,
      action,
      method: 'manual',
      matched: true,
      matchScore: null,
      confidenceScore: null,
      livenessScore: null,
      spoofFlags: spoofFlags ?? null,
      failureReason: null,
      attendanceId: attendanceId ?? null,
      securityEvent: false,
    })
    return { ok: true as const, logId: log.id, distance: null, manual: true, confidence: null }
  }

  if (!liveDescriptor.length) {
    const log = await logFaceEvent({
      userId,
      action,
      method: 'face',
      matched: false,
      matchScore: null,
      confidenceScore: detectionScore,
      livenessScore,
      spoofFlags: spoofFlags ?? null,
      failureReason: 'no_descriptor',
      attendanceId: attendanceId ?? null,
      securityEvent: true,
    })
    return {
      ok: false as const,
      logId: log.id,
      error: 'ไม่พบใบหน้าในภาพ — ลองสแกนใหม่',
      code: 'NO_FACE',
    }
  }

  if (detectionScore > 0 && detectionScore < MIN_DETECTION_SCORE) {
    const log = await logFaceEvent({
      userId,
      action,
      method: 'face',
      matched: false,
      matchScore: null,
      confidenceScore: detectionScore,
      livenessScore,
      spoofFlags: spoofFlags ?? null,
      failureReason: 'low_detection_score',
      attendanceId: attendanceId ?? null,
      securityEvent: true,
    })
    return {
      ok: false as const,
      logId: log.id,
      error: 'ภาพใบหน้าไม่ชัด — จัดหน้าให้อยู่ในกรอบแล้วลองใหม่',
      code: 'LOW_CONFIDENCE',
    }
  }

  const profile = await prisma.userFaceProfile.findUnique({ where: { userId } })
  if (!profile) {
    const log = await logFaceEvent({
      userId,
      action,
      method: 'face',
      matched: false,
      matchScore: null,
      confidenceScore: detectionScore,
      livenessScore,
      spoofFlags: spoofFlags ?? null,
      failureReason: 'not_registered',
      attendanceId: attendanceId ?? null,
      securityEvent: true,
    })
    return {
      ok: false as const,
      logId: log.id,
      error: 'ยังไม่ได้ลงทะเบียนใบหน้า',
      code: 'NOT_REGISTERED',
    }
  }

  let stored: number[]
  try {
    stored = decryptFaceDescriptor(profile.encryptedDescriptor)
  } catch {
    const log = await logFaceEvent({
      userId,
      action,
      method: 'face',
      matched: false,
      matchScore: null,
      confidenceScore: detectionScore,
      livenessScore,
      spoofFlags: spoofFlags ?? null,
      failureReason: 'decrypt_error',
      attendanceId: attendanceId ?? null,
      securityEvent: true,
    })
    return { ok: false as const, logId: log.id, error: 'ข้อมูลใบหน้าเสียหาย กรุณาลงทะเบียนใหม่', code: 'CORRUPT' }
  }

  const distance = faceDescriptorDistance(stored, liveDescriptor)
  const matched = isFaceMatch(distance)
  const confidence = Math.max(0, Math.min(1, 1 - distance / FACE_MATCH_THRESHOLD))

  const log = await logFaceEvent({
    userId,
    action,
    method: 'face',
    matched,
    matchScore: distance,
    confidenceScore: confidence,
    livenessScore,
    spoofFlags: spoofFlags ?? null,
    failureReason: matched ? null : 'security_face_mismatch',
    attendanceId: attendanceId ?? null,
    securityEvent: !matched,
  })

  if (!matched) {
    await handleSecurityFailure({
      userId,
      action,
      failureReason: 'security_face_mismatch',
      logId: log.id,
      distance,
    })
    const attempts = await countRecentFaceMismatches(userId)
    return {
      ok: false as const,
      logId: log.id,
      error:
        attempts >= 2
          ? 'ใบหน้าไม่ตรงกับที่ลงทะเบียน — ตรวจพบความผิดปกติซ้ำ กรุณาติดต่อ HR'
          : 'ใบหน้าไม่ตรงกับที่ลงทะเบียน — ห้ามให้ผู้อื่นสแกนแทน',
      code: 'MISMATCH',
      distance,
      confidence,
    }
  }

  return {
    ok: true as const,
    logId: log.id,
    distance,
    confidence,
    livenessScore,
    detectionScore,
  }
}

export async function logFaceEvent(params: {
  userId: string
  action: string
  method: string
  matched: boolean
  matchScore: number | null
  confidenceScore?: number | null
  livenessScore: number | null
  spoofFlags: string | null
  failureReason: string | null
  attendanceId: string | null
  securityEvent?: boolean
}) {
  const spoof =
    params.spoofFlags ??
    (params.securityEvent ? JSON.stringify({ security: true }) : null)

  return prisma.attendanceFaceLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      method: params.method,
      matched: params.matched,
      matchScore: params.matchScore ?? undefined,
      livenessScore: params.livenessScore ?? undefined,
      spoofFlags: spoof ?? undefined,
      failureReason: params.failureReason ?? undefined,
      attendanceId: params.attendanceId ?? undefined,
    },
  })
}

export function parseDescriptorFromBody(body: unknown): number[] | null {
  if (!body || typeof body !== 'object') return null
  const d = (body as { descriptor?: unknown }).descriptor
  return parseDescriptorPayload(d)
}

export function parseSamplesFromBody(body: unknown): number[][] | null {
  if (!body || typeof body !== 'object') return null
  const samples = (body as { samples?: unknown }).samples
  if (!Array.isArray(samples)) return null
  const parsed = samples.map((s) => parseDescriptorPayload(s)).filter((x): x is number[] => !!x)
  return parsed.length > 0 ? parsed : null
}
