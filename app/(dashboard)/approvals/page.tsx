import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import ApprovalPanel from '@/components/dashboard/ApprovalPanel'

export default async function ApprovalsPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  const { role } = session.user
  if (role !== 'MANAGER_HR' && role !== 'ADMIN') redirect('/dashboard')

  // Admin sees PENDING, Manager sees ADMIN_APPROVED
  const leaveStatus = role === 'ADMIN' ? 'PENDING' : 'ADMIN_APPROVED'
  const outsideStatus = leaveStatus

  const [leaveRequests, outsideRequests, weeklyPlans] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: leaveStatus },
      include: { user: { select: { name: true, email: true, department: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.outsideWorkRequest.findMany({
      where: { status: outsideStatus },
      include: { user: { select: { name: true, email: true, department: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    role === 'MANAGER_HR'
      ? prisma.weeklyLawyerPlan.findMany({
          where: { status: 'ADMIN_APPROVED' },
          include: { lawyer: { select: { name: true, email: true } }, days: true },
          orderBy: { createdAt: 'desc' },
        })
      : prisma.weeklyLawyerPlan.findMany({
          where: { status: 'PENDING' },
          include: { lawyer: { select: { name: true, email: true } }, days: true },
          orderBy: { createdAt: 'desc' },
        }),
  ])

  const user = { name: session.user.name ?? '', email: session.user.email ?? '', role, department: session.user.department }

  return (
    <div className="flex flex-col">
      <Topbar title="อนุมัติคำขอ" subtitle={role === 'ADMIN' ? 'Step 1 — ตรวจสอบเบื้องต้น' : 'Step 2 — Final Approval'} user={user} />
      <ApprovalPanel
        leaveRequests={JSON.parse(JSON.stringify(leaveRequests))}
        outsideRequests={JSON.parse(JSON.stringify(outsideRequests))}
        weeklyPlans={JSON.parse(JSON.stringify(weeklyPlans))}
        userRole={role}
      />
    </div>
  )
}
