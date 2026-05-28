import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { parseDescriptorFromBody, verifyFaceForAttendance } from '@/lib/face-attendance'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
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
      return NextResponse.json(
        { error: result.error, code: result.code, logId: result.logId, distance: result.distance },
        { status: 403 },
      )
    }

    return NextResponse.json({
      success: true,
      logId: result.logId,
      distance: result.distance,
      manual: result.manual ?? false,
    })
  } catch (err) {
    return apiError(err)
  }
}
