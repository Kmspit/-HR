import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { userHasFaceProfile, shouldRequireFaceVerification } from '@/lib/face-attendance'
import {
  CONSENT_VERSION,
  daysRemainingInGracePeriod,
  getLatestConsentAction,
  gracePeriodEndsAt,
  isPastGracePeriod,
  recordConsentAction,
  type ConsentAction,
  type ConsentMethod,
} from '@/lib/biometric-consent'

const VALID_ACTIONS: ConsentAction[] = ['GRANTED', 'REVOKED']
const VALID_METHODS: ConsentMethod[] = ['CHECKBOX', 'DIGITAL_SIGNATURE']

function requestIp(req: NextRequest): string | undefined {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const [hasProfile, latestAction, faceRequired] = await Promise.all([
      userHasFaceProfile(userId),
      getLatestConsentAction(userId),
      shouldRequireFaceVerification(userId),
    ])

    return NextResponse.json({
      hasProfile,
      latestAction,
      faceRequired,
      consentVersion: CONSENT_VERSION,
      gracePeriod: {
        active: hasProfile && latestAction === null && !isPastGracePeriod(),
        daysRemaining: daysRemainingInGracePeriod(),
        endsAt: gracePeriodEndsAt().toISOString(),
      },
    })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const action = body?.action
    const method = body?.method
    const consentText = body?.consentText
    const scrolledToEnd = body?.scrolledToEnd
    const deviceKey = typeof body?.deviceKey === 'string' ? body.deviceKey : undefined

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 })
    }
    if (!VALID_METHODS.includes(method)) {
      return NextResponse.json({ error: 'method ไม่ถูกต้อง' }, { status: 400 })
    }
    if (typeof consentText !== 'string' || !consentText.trim()) {
      return NextResponse.json({ error: 'consentText ต้องไม่ว่าง' }, { status: 400 })
    }
    if (action === 'GRANTED' && scrolledToEnd !== true) {
      return NextResponse.json(
        { error: 'ต้องอ่านข้อความยินยอมจนจบก่อนกดยอมรับ' },
        { status: 400 },
      )
    }

    const consent = await recordConsentAction({
      userId: session.user.id,
      action,
      consentText,
      method,
      scrolledToEnd: scrolledToEnd === true,
      ipAddress: requestIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
      deviceKey,
    })

    return NextResponse.json({ success: true, id: consent.id, action: consent.action })
  } catch (err) {
    return apiError(err)
  }
}
