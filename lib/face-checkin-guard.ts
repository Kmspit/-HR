import { NextResponse } from 'next/server'
import { parseDescriptorPayload } from '@/lib/face-match'
import { verifyFaceForAttendance } from '@/lib/face-attendance'

/** Optional face gate for attendance POST — does not block manual mode */
export async function guardAttendanceFace(
  userId: string,
  formData: FormData,
  action: 'checkin' | 'checkout' | 'lunch-out' | 'lunch-in',
) {
  const method = (formData.get('attendanceMethod') as string) || 'manual'
  if (method !== 'face') {
    await verifyFaceForAttendance({
      userId,
      liveDescriptor: [],
      livenessScore: 0,
      action,
      method: 'manual',
      attendanceId: null,
      spoofFlags: (formData.get('spoofFlags') as string) || null,
    })
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
    return NextResponse.json({ error: 'ข้อมูลใบหน้าไม่ครบ — ลองสแกนใหม่หรือใช้โหมดถ่ายรูป' }, { status: 400 })
  }

  const livenessScore = Number(formData.get('livenessScore') ?? 0)
  const spoofFlags = (formData.get('spoofFlags') as string) || null

  const result = await verifyFaceForAttendance({
    userId,
    liveDescriptor: descriptor,
    livenessScore,
    action,
    method: 'face',
    attendanceId: null,
    spoofFlags,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code, logId: result.logId },
      { status: 403 },
    )
  }

  return null
}
