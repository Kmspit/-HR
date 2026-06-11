import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import ApprovalCenterClient from './ApprovalCenterClient'

export default async function ApprovalCenterPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  const ALLOWED = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
  if (!ALLOWED.includes(session.user.role)) redirect('/dashboard')

  return (
    <div className="flex flex-col">
      <Topbar
        title="ศูนย์อนุมัติ"
        subtitle="Approval Center — Multi-Level Workflow & Digital Signature"
      />
      <ApprovalCenterClient
        userId={session.user.id}
        userRole={session.user.role}
        userName={session.user.name ?? ''}
      />
    </div>
  )
}
