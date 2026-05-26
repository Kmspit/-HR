import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

const ALLOWED_FIELDS = [
  'companyName', 'companyNameEn', 'officeAddress', 'workStartTime', 'workEndTime', 'lateGraceMin',
  'sickDaysYear', 'vacationDaysYear', 'personalDaysYear',
  'lineChannelId', 'lineChannelSecret', 'lineAccessToken', 'lineNotifyToken',
  'geofenceLat', 'geofenceLng', 'geofenceRadius', 'lateDeductRate', 'absentDeductRate',
] as const

export async function GET() {
  try {
    const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
    if (!settings) {
      const created = await prisma.companySettings.create({ data: { id: 'singleton' } })
      return NextResponse.json({ settings: created })
    }
    return NextResponse.json({ settings })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const data: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      if (key in body) data[key] = body[key]
    }

    const settings = await prisma.companySettings.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    })

    return NextResponse.json({ settings })
  } catch (err) {
    return apiError(err)
  }
}
