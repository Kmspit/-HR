import { prisma } from '@/lib/prisma'
import { decryptFaceDescriptor, encryptFaceDescriptor } from '@/lib/face-crypto'
import {
  averageDescriptors,
  faceDescriptorDistance,
  isFaceMatch,
  parseDescriptorPayload,
} from '@/lib/face-match'

export type FaceVerifyInput = {
  userId: string
  liveDescriptor: number[]
  livenessScore: number
  action: string
  method: 'face' | 'manual'
  attendanceId?: string | null
  spoofFlags?: string | null
}

const MIN_LIVENESS = 0.35

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
) {
  if (samples.length < 1) throw new Error('NO_SAMPLES')
  if (livenessScore < MIN_LIVENESS) throw new Error('LIVENESS_FAILED')

  const merged = samples.length === 1 ? samples[0] : averageDescriptors(samples)
  const encryptedDescriptor = encryptFaceDescriptor(merged)

  const profile = await prisma.userFaceProfile.upsert({
    where: { userId },
    create: {
      userId,
      encryptedDescriptor,
      sampleCount: samples.length,
      modelVersion: 'face-api-tiny-v1',
    },
    update: {
      encryptedDescriptor,
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
    livenessScore,
    spoofFlags: null,
    failureReason: null,
    attendanceId: null,
  })

  return profile
}

export async function verifyFaceForAttendance(input: FaceVerifyInput) {
  const {
    userId,
    liveDescriptor,
    livenessScore,
    action,
    method,
    attendanceId,
    spoofFlags,
  } = input

  if (method === 'manual') {
    const log = await logFaceEvent({
      userId,
      action,
      method: 'manual',
      matched: true,
      matchScore: null,
      livenessScore: null,
      spoofFlags: spoofFlags ?? null,
      failureReason: null,
      attendanceId: attendanceId ?? null,
    })
    return { ok: true as const, logId: log.id, distance: null, manual: true }
  }

  if (livenessScore < MIN_LIVENESS) {
    const log = await logFaceEvent({
      userId,
      action,
      method: 'face',
      matched: false,
      matchScore: null,
      livenessScore,
      spoofFlags: spoofFlags ?? null,
      failureReason: 'liveness_failed',
      attendanceId: attendanceId ?? null,
    })
    return { ok: false as const, logId: log.id, error: 'การตรวจสอบความมีชีวิตไม่ผ่าน กรุณาลองใหม่', code: 'LIVENESS' }
  }

  const profile = await prisma.userFaceProfile.findUnique({ where: { userId } })
  if (!profile) {
    const log = await logFaceEvent({
      userId,
      action,
      method: 'face',
      matched: false,
      matchScore: null,
      livenessScore,
      spoofFlags: spoofFlags ?? null,
      failureReason: 'not_registered',
      attendanceId: attendanceId ?? null,
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
      livenessScore,
      spoofFlags: spoofFlags ?? null,
      failureReason: 'decrypt_error',
      attendanceId: attendanceId ?? null,
    })
    return { ok: false as const, logId: log.id, error: 'ข้อมูลใบหน้าเสียหาย กรุณาลงทะเบียนใหม่', code: 'CORRUPT' }
  }

  const distance = faceDescriptorDistance(stored, liveDescriptor)
  const matched = isFaceMatch(distance)

  const log = await logFaceEvent({
    userId,
    action,
    method: 'face',
    matched,
    matchScore: distance,
    livenessScore,
    spoofFlags: spoofFlags ?? null,
    failureReason: matched ? null : 'face_mismatch',
    attendanceId: attendanceId ?? null,
  })

  if (!matched) {
    return {
      ok: false as const,
      logId: log.id,
      error: 'ใบหน้าไม่ตรงกับที่ลงทะเบียน',
      code: 'MISMATCH',
      distance,
    }
  }

  return { ok: true as const, logId: log.id, distance }
}

export async function logFaceEvent(params: {
  userId: string
  action: string
  method: string
  matched: boolean
  matchScore: number | null
  livenessScore: number | null
  spoofFlags: string | null
  failureReason: string | null
  attendanceId: string | null
}) {
  return prisma.attendanceFaceLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      method: params.method,
      matched: params.matched,
      matchScore: params.matchScore ?? undefined,
      livenessScore: params.livenessScore ?? undefined,
      spoofFlags: params.spoofFlags ?? undefined,
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
