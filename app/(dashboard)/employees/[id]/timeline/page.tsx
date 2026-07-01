import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import EmployeeTimelineClient from '@/components/employee-timeline/EmployeeTimelineClient'
import { canViewEmployeeTimeline } from '@/lib/employee-timeline/access'
import { loadEmployeeTimeline } from '@/lib/employee-timeline/load-data'
import type { Role } from '@prisma/client'

export default async function EmployeeTimelinePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  const allowed = await canViewEmployeeTimeline(
    prisma,
    session.user.id,
    session.user.role as Role,
    session.user.branchId,
    id,
  )
  if (!allowed) redirect('/unauthorized')

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
