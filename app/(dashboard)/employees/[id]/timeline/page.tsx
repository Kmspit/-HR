import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import EmployeeTimelineClient from '@/components/employee-timeline/EmployeeTimelineClient'
import { loadEmployeeTimeline } from '@/lib/employee-timeline/load-data'
import { canManageUsers } from '@/lib/permissions'

export default async function EmployeeTimelinePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canManageUsers(session.user.role)) redirect('/unauthorized')

  const data = await loadEmployeeTimeline(prisma, id)
  if (!data) notFound()

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="ไทม์ไลน์พนักงาน"
        subtitle={`${data.employee.name} · ${data.events.length} เหตุการณ์`}
      />
      <EmployeeTimelineClient {...JSON.parse(JSON.stringify(data))} />
    </div>
  )
}
