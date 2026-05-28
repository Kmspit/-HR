import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { getFaceRegistrationStatus } from '@/lib/face-attendance'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const status = await getFaceRegistrationStatus(session.user.id)
    return NextResponse.json(status)
  } catch (err) {
    return apiError(err)
  }
}
