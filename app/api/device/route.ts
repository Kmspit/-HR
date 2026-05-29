import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { registerDevice } from '@/lib/device'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const device = await prisma.userDevice.findUnique({ where: { userId: session.user.id } })
    return NextResponse.json({ device })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const deviceKey = String(body.deviceKey ?? req.headers.get('X-Device-Key') ?? '').trim()
    if (!deviceKey) return NextResponse.json({ error: 'deviceKey required' }, { status: 400 })

    const result = await registerDevice(session.user.id, deviceKey, body.deviceLabel)

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return apiError(err)
  }
}
