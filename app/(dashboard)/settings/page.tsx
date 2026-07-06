import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import SettingsClient from './SettingsClient'
import { canAccessPage } from '@/lib/page-access'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')
  if (!canAccessPage(session.user.role, '/settings')) redirect('/unauthorized')

  // Explicit select — never full-select this model (see CONTRIBUTING.md #4):
  // a newly added schema field can lag behind the actual DB column until the
  // ensure-db-schema migration runs, and a full-select would 500 in that window.
  const settings = await prisma.companySettings.findUnique({
    where: { id: 'singleton' },
    select: {
      companyName: true, companyNameEn: true, workStartTime: true, workEndTime: true, lateGraceMin: true,
      sickDaysYear: true, vacationDaysYear: true, personalDaysYear: true,
      lineChannelId: true, lineChannelSecret: true, lineAccessToken: true, lineNotifyToken: true,
      geofenceLat: true, geofenceLng: true, geofenceRadius: true,
      lateDeductRate: true, absentDeductRate: true, imageRetentionDays: true, outsideWorkPlanTitle: true,
    },
  })

  return <SettingsClient settings={settings as any} />
}
