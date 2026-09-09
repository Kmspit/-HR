import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { parseSamplesFromBody, registerFaceProfile } from '@/lib/face-attendance'
import { getLatestConsentAction } from '@/lib/biometric-consent'

function parseRegistrationImage(body: Record<string, unknown>) {
  const b64 = body.registrationImageBase64
  if (typeof b64 !== 'string' || !b64.startsWith('data:image')) return null
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(b64)
  if (!m) return null
  return { buffer: Buffer.from(m[2], 'base64'), mime: m[1] }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Enrollment is hard-blocked without explicit consent — no grace period here,
    // that only applies to profiles that already existed before the consent
    // requirement shipped (see lib/biometric-consent.ts's hasValidFaceConsent()).
    const latestConsent = await getLatestConsentAction(session.user.id)
    if (latestConsent !== 'GRANTED') {
      return NextResponse.json(
        { error: 'ต้องยินยอมให้เก็บข้อมูลชีวมิติ (ใบหน้า) ก่อนลงทะเบียน', code: 'CONSENT_REQUIRED' },
        { status: 403 },
      )
    }

    const body = await req.json()
    const samples = parseSamplesFromBody(body)
    const registrationImage = parseRegistrationImage(body as Record<string, unknown>)

    if (!samples || samples.length < 3) {
      return NextResponse.json(
        { error: 'ต้องถ่ายใบหน้าตรงกล้องครบ 3 ภาพตามขั้นตอน' },
        { status: 400 },
      )
    }

    const profile = await registerFaceProfile(session.user.id, samples, 1, registrationImage)
    return NextResponse.json({
      success: true,
      registeredAt: profile.registeredAt.toISOString(),
      sampleCount: profile.sampleCount,
    })
  } catch (err) {
    return apiError(err)
  }
}
