import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import ApprovalPanel from '@/components/dashboard/ApprovalPanel'
import DocumentApprovalPanel from '@/components/dashboard/DocumentApprovalPanel'
import { getPendingLeaveForApprover, getPendingOutsideForApprover, getPendingWeeklyForApprover } from '@/lib/approval-inbox'
import { hasPermission } from '@/lib/rbac'
import type { Role } from '@prisma/client'

const APPROVER_ROLES: Role[] = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER',
]

export default async function ApprovalsPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  const { role, id: userId } = session.user
  if (!APPROVER_ROLES.includes(role as Role)) redirect('/dashboard')
  if (
    !hasPermission(role as Role, 'approve_leave') &&
    !hasPermission(role as Role, 'approve_outside_work') &&
    !hasPermission(role as Role, 'approve_weekly_plan') &&
    role !== 'CEO' && role !== 'ADMIN'
  ) {
    redirect('/dashboard')
  }

  const [leaveRequests, outsideRequests, weeklyPlans] = await Promise.all([
    getPendingLeaveForApprover(prisma, userId, role as Role),
    getPendingOutsideForApprover(prisma, userId, role as Role),
    hasPermission(role as Role, 'approve_weekly_plan') || role === 'CEO' || role === 'ADMIN'
      ? getPendingWeeklyForApprover(prisma, userId, role as Role)
      : Promise.resolve([]),
  ])

  return (
    <div className="flex flex-col">
      <Topbar
        title="ศูนย์อนุมัติ"
        subtitle="คำขอที่รอการอนุมัติจากคุณ — ลา · ออกนอกสถานที่ · แผนงาน"
      />
      <ApprovalPanel
        leaveRequests={JSON.parse(JSON.stringify(leaveRequests))}
        outsideRequests={JSON.parse(JSON.stringify(outsideRequests))}
        weeklyPlans={JSON.parse(JSON.stringify(weeklyPlans))}
        userRole={role}
      />
      <div className="px-4 pb-8 md:px-6">
        <DocumentApprovalPanel />
      </div>
    </div>
  )
}
