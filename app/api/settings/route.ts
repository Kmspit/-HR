import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { clearLineCredentialsCache } from '@/lib/line-credentials'
import { maskSettingsSecrets } from '@/lib/settings-api'
import { requireRoles, isGuardResponse, requireCsrf } from '@/lib/api-guard'

const ALLOWED_FIELDS = [
  'companyName', 'companyNameEn', 'officeAddress', 'workStartTime', 'workEndTime', 'lateGraceMin',
  'sickDaysYear', 'vacationDaysYear', 'personalDaysYear',
  'lineChannelId', 'lineChannelSecret', 'lineAccessToken', 'lineNotifyToken',
  'geofenceLat', 'geofenceLng', 'geofenceRadius', 'lateDeductRate', 'absentDeductRate',
  'imageRetentionDays', 'outsideWorkPlanTitle',
] as const

const RETENTION_OPTIONS = [30, 90, 180] as const

const SETTINGS_VIEW_ROLES = ['MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO'] as const

// Explicit select — never full-select this model (see CONTRIBUTING.md #4):
// a newly added schema field can lag behind the actual DB column until the
// ensure-db-schema migration runs, and a full-select would 500 in that window.
const SETTINGS_SELECT = {
  id: true, companyName: true, companyNameEn: true, officeAddress: true, logoUrl: true,
  workStartTime: true, workEndTime: true, lunchReturnTime: true, lateGraceMin: true,
  sickDaysYear: true, vacationDaysYear: true, personalDaysYear: true,
  lineChannelId: true, lineChannelSecret: true, lineAccessToken: true, lineNotifyToken: true,
  geofenceLat: true, geofenceLng: true, geofenceRadius: true,
  lateDeductRate: true, absentDeductRate: true, imageRetentionDays: true, probationMonths: true,
  outsideWorkPlanTitle: true, updatedAt: true,
} as const

export async function GET() {
  try {
    const session = await requireRoles([...SETTINGS_VIEW_ROLES])
    if (isGuardResponse(session)) return session

    const canSeeSecrets = ['MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO'].includes(session.user.role)

    const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' }, select: SETTINGS_SELECT })
    if (!settings) {
      const created = await prisma.companySettings.create({ data: { id: 'singleton' }, select: SETTINGS_SELECT })
      return NextResponse.json({ settings: maskSettingsSecrets(created, canSeeSecrets) })
    }
    return NextResponse.json({ settings: maskSettingsSecrets(settings, canSeeSecrets) })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const session = await requireRoles(['MANAGER_HR', 'ADMIN'])
    if (isGuardResponse(session)) return session

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
      select: SETTINGS_SELECT,
    })

    if ('lineChannelSecret' in data || 'lineAccessToken' in data) {
      clearLineCredentialsCache()
    }

    return NextResponse.json({ settings: maskSettingsSecrets(settings, true) })
  } catch (err) {
    return apiError(err)
  }
}
