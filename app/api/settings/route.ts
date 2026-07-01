import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { clearLineCredentialsCache } from '@/lib/line-credentials'
import { maskSettingsSecrets } from '@/lib/settings-api'

const ALLOWED_FIELDS = [
  'companyName', 'companyNameEn', 'officeAddress', 'workStartTime', 'workEndTime', 'lateGraceMin',
  'sickDaysYear', 'vacationDaysYear', 'personalDaysYear',
  'lineChannelId', 'lineChannelSecret', 'lineAccessToken', 'lineNotifyToken',
  'geofenceLat', 'geofenceLng', 'geofenceRadius', 'lateDeductRate', 'absentDeductRate',
  'imageRetentionDays',
] as const

const RETENTION_OPTIONS = [30, 90, 180] as const

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const canSeeSecrets = ['MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO'].includes(session.user.role)

    const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
    if (!settings) {
      const created = await prisma.companySettings.create({ data: { id: 'singleton' } })
      return NextResponse.json({ settings: maskSettingsSecrets(created, canSeeSecrets) })
    }
    return NextResponse.json({ settings: maskSettingsSecrets(settings, canSeeSecrets) })
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
    if ('imageRetentionDays' in data) {
      const days = Number(data.imageRetentionDays)
      if (!RETENTION_OPTIONS.includes(days as (typeof RETENTION_OPTIONS)[number])) {
        return NextResponse.json(
          { error: 'imageRetentionDays ต้องเป็น 30, 90 หรือ 180' },
          { status: 400 },
        )
      }
      data.imageRetentionDays = days
    }

    const settings = await prisma.companySettings.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    })

    if ('lineChannelSecret' in data || 'lineAccessToken' in data) {
      clearLineCredentialsCache()
    }

    return NextResponse.json({ settings: maskSettingsSecrets(settings, true) })
  } catch (err) {
    return apiError(err)
  }
}
