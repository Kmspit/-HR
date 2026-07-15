import { NextResponse } from 'next/server'
import { parseDescriptorPayload } from '@/lib/face-match'
import {
  isAttendanceFaceAction,
  userHasFaceProfile,
  verifyFaceForAttendance,
} from '@/lib/face-attendance'
import { notifyHrFaceMismatchOnLine } from '@/lib/attendance-line-notify'
import { logAccessDenied } from '@/lib/access-log'

/** Face gate for attendance POST — บังคับสแกนใบหน้าเมื่อลงทะเบียนแล้ว */
export async function guardAttendanceFace(
  userId: string,
  formData: FormData,
  action: 'checkin' | 'checkout' | 'lunch-out' | 'lunch-in',
) {
  if (!isAttendanceFaceAction(action)) {
    return NextResponse.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 })
  }

  const registered = await userHasFaceProfile(userId)
  const method = (formData.get('attendanceMethod') as string) || 'manual'

  if (registered && method !== 'face') {
    logAccessDenied('face_denied', { userId, action, code: 'FACE_REQUIRED' })
    return NextResponse.json(
      {
        error: 'ต้องยืนยันใบหน้าด้วยการสแกน — ไม่อนุญาตถ่ายรูปอย่างเดียว',
        code: 'FACE_REQUIRED',
      },
      { status: 403 },
    )
  }

  if (method !== 'face') {
    const result = await verifyFaceForAttendance({
      userId,
      liveDescriptor: [],
      livenessScore: 0,
      action,
      method: 'manual',
      attendanceId: null,
      spoofFlags: (formData.get('spoofFlags') as string) || null,
    })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code, logId: result.logId },
        { status: 403 },
      )
    }
    return null
  }

  const raw = formData.get('faceDescriptor')
  let descriptor: number[] | null = null
  if (typeof raw === 'string') {
    try {
      descriptor = parseDescriptorPayload(JSON.parse(raw))
    } catch {
      descriptor = null
    }
  }

  if (!descriptor) {
    return NextResponse.json(
      { error: 'ข้อมูลใบหน้าไม่ครบ — ทำขั้นตอนสแกนใบหน้าให้ครบก่อนลงเวลา', code: 'NO_DESCRIPTOR' },
      { status: 400 },
    )
  }

  const livenessScore = Number(formData.get('livenessScore') ?? 0)
  const detectionScore = Number(formData.get('detectionScore') ?? 0)
  const spoofFlags = (formData.get('spoofFlags') as string) || null
  const sessionUserId = (formData.get('sessionUserId') as string) || userId

  if (sessionUserId !== userId) {
    await verifyFaceForAttendance({
      userId,
      liveDescriptor: descriptor,
      livenessScore,
      detectionScore,
      action,
      method: 'face',
      attendanceId: null,
      spoofFlags: JSON.stringify({ flags: ['wrong_user'], submittedUserId: sessionUserId }),
    })
    logAccessDenied('face_denied', { userId, action, code: 'WRONG_USER', submittedUserId: sessionUserId })
    return NextResponse.json(
      { error: 'ข้อมูลผู้ใช้ไม่ตรงกับ session — ห้ามสลับบัญชี', code: 'WRONG_USER' },
      { status: 403 },
    )
  }

  const result = await verifyFaceForAttendance({
    userId,
    liveDescriptor: descriptor,
    livenessScore,
    detectionScore,
    action,
    method: 'face',
    attendanceId: null,
    spoofFlags,
  })

  if (!result.ok) {
    logAccessDenied('face_denied', { userId, action, code: result.code })
    const mismatchCodes = ['MISMATCH', 'SPOOF', 'FACE_REQUIRED', 'WRONG_USER', 'LOW_CONFIDENCE']
    if (mismatchCodes.includes(result.code)) {
      void notifyHrFaceMismatchOnLine({
        employeeUserId: userId,
        action,
        faceLogId: result.logId,
        failureReason:
          result.code === 'MISMATCH'
            ? 'security_face_mismatch'
            : result.code === 'SPOOF'
              ? 'spoof_detected'
              : result.code,
      }).catch((err) => console.error('[face-guard-line]', err))
    }
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        logId: result.logId,
        distance: 'distance' in result ? result.distance : undefined,
        confidence: 'confidence' in result ? result.confidence : undefined,
      },
      { status: result.code === 'RATE_LIMITED' ? 429 : 403 },
    )
  }

  return null
}
