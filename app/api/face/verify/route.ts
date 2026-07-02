import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { requireCsrf } from '@/lib/api-guard'
import { parseDescriptorFromBody, verifyFaceForAttendance } from '@/lib/face-attendance'
import { notifyHrFaceMismatchOnLine } from '@/lib/attendance-line-notify'
import { logAccessDenied } from '@/lib/access-log'

export async function POST(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const session = await auth()
    if (!session?.user?.id) {
      logAccessDenied('missing_session', { route: '/api/face/verify' })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const descriptor = parseDescriptorFromBody(body)
    const method = body.method === 'manual' ? 'manual' : 'face'
    const action = String(body.action || 'verify')
    const livenessScore = Number(body.livenessScore ?? 0)
    const spoofFlags = body.spoofFlags != null ? String(body.spoofFlags) : null

    if (method === 'face' && !descriptor) {
      return NextResponse.json({ error: 'ข้อมูลใบหน้าไม่ถูกต้อง' }, { status: 400 })
    }

    const result = await verifyFaceForAttendance({
      userId: session.user.id,
      liveDescriptor: descriptor ?? [],
      livenessScore,
      action,
      method,
      attendanceId: body.attendanceId ? String(body.attendanceId) : null,
      spoofFlags,
    })

    if (!result.ok) {
      logAccessDenied('face_denied', { userId: session.user.id, action, code: result.code })
      if (['MISMATCH', 'SPOOF', 'LOW_CONFIDENCE'].includes(result.code)) {
        void notifyHrFaceMismatchOnLine({
          employeeUserId: session.user.id,
          action,
          faceLogId: result.logId,
          failureReason:
            result.code === 'MISMATCH' ? 'security_face_mismatch' : 'spoof_detected',
        }).catch((err) => console.error('[face-verify-line]', err))
      }
      return NextResponse.json(
        { error: result.error, code: result.code, logId: result.logId, distance: result.distance },
        { status: 403 },
      )
    }

    return NextResponse.json({
      success: true,
      logId: result.logId,
      distance: result.distance,
      confidence: 'confidence' in result ? result.confidence : null,
      livenessScore: 'livenessScore' in result ? result.livenessScore : null,
      detectionScore: 'detectionScore' in result ? result.detectionScore : null,
      manual: result.manual ?? false,
    })
  } catch (err) {
    return apiError(err)
  }
}
