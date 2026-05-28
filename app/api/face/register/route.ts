import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { parseSamplesFromBody, registerFaceProfile } from '@/lib/face-attendance'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const samples = parseSamplesFromBody(body)
    const livenessScore = Number(body.livenessScore ?? 0)

    if (!samples || samples.length < 3) {
      return NextResponse.json(
        { error: 'ต้องสแกนใบหน้าครบ 3 ครั้ง (หน้าตรง / ซ้าย / ขวา) ตามขั้นตอนสอน' },
        { status: 400 },
      )
    }

    try {
      const profile = await registerFaceProfile(session.user.id, samples, livenessScore)
      return NextResponse.json({
        success: true,
        registeredAt: profile.registeredAt.toISOString(),
        sampleCount: profile.sampleCount,
      })
    } catch (e) {
      if (e instanceof Error && e.message === 'LIVENESS_FAILED') {
        return NextResponse.json({ error: 'การตรวจสอบความมีชีวิตไม่ผ่าน' }, { status: 400 })
      }
      throw e
    }
  } catch (err) {
    return apiError(err)
  }
}
