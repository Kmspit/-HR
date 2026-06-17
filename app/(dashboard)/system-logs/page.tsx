import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import SystemLogsClient from './SystemLogsClient'

const ALLOWED_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export default async function SystemLogsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!ALLOWED_ROLES.includes(session.user.role)) redirect('/dashboard')

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <Topbar title="System Logs" subtitle="บันทึกกิจกรรมระบบและ Error ทั้งหมด" />
      <SystemLogsClient />
    </div>
  )
}
