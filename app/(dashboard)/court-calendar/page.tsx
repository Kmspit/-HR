import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import CourtCalendarClient from './CourtCalendarClient'

export default async function CourtCalendarPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const LEGAL_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER', 'ENFORCEMENT', 'TEAM_LEADER']
  if (!LEGAL_ROLES.includes(session.user.role)) redirect('/dashboard')

  return (
    <div className="flex flex-col min-h-0">
      <Topbar title="ปฏิทินนัดศาล" subtitle="ตารางนัดหมายศาลและกำหนดการทางกฎหมาย" />
      <CourtCalendarClient
        userId={session.user.id}
        userName={session.user.name ?? ''}
        role={session.user.role}
        department={session.user.department ?? null}
      />
    </div>
  )
}
