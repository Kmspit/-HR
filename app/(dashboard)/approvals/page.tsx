import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import ApprovalPanel from '@/components/dashboard/ApprovalPanel'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import {
  buildBranchScope,
  requestUserWhere,
  branchNestedUserWhere,
  parseBranchQueryParam,
} from '@/lib/branch-scope'
import { Suspense } from 'react'

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/')

  const { role } = session.user
  if (role !== 'MANAGER_HR' && role !== 'ADMIN') redirect('/dashboard')

  const sp = await searchParams
  const branchParam = parseBranchQueryParam(sp.branchId)
  const scope = buildBranchScope(session.user, { branchId: branchParam })
  const nestedUser = branchNestedUserWhere(scope)

  // Admin sees PENDING, Manager sees ADMIN_APPROVED
  const leaveStatus = role === 'ADMIN' ? 'PENDING' : 'ADMIN_APPROVED'
  const outsideStatus = leaveStatus

  const [leaveRequests, outsideRequests, weeklyPlans] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: requestUserWhere(scope, { status: leaveStatus }),
      include: { user: { select: { name: true, email: true, department: true, position: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.outsideWorkRequest.findMany({
      where: {
        status: outsideStatus,
        ...(nestedUser ? { user: nestedUser } : {}),
      },
      include: { user: { select: { name: true, email: true, department: true, position: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    // MANAGER_HR = หัวหน้างาน (Step 1): sees pending_supervisor or legacy PENDING
    // ADMIN = ผู้บริหาร (Step 2): sees pending_executive or legacy ADMIN_APPROVED
    role === 'MANAGER_HR'
      ? prisma.weeklyLawyerPlan.findMany({
          where: {
            OR: [{ approvalStatus: 'pending_supervisor' }, { approvalStatus: null, status: 'PENDING' }],
            ...(nestedUser ? { lawyer: nestedUser } : {}),
          },
          include: { lawyer: { select: { name: true, email: true } }, days: true },
          orderBy: { createdAt: 'desc' },
        })
      : prisma.weeklyLawyerPlan.findMany({
          where: {
            OR: [{ approvalStatus: 'pending_executive' }, { approvalStatus: null, status: 'ADMIN_APPROVED' }],
            ...(nestedUser ? { lawyer: nestedUser } : {}),
          },
          include: { lawyer: { select: { name: true, email: true } }, days: true },
          orderBy: { createdAt: 'desc' },
        }),
  ])

  const user = { name: session.user.name ?? '', email: session.user.email ?? '', role, department: session.user.department }

  return (
    <div className="flex flex-col">
      <Topbar title="อนุมัติคำขอ" subtitle={role === 'ADMIN' ? 'ผู้บริหาร — คำขอลา Step 1 · แผนงาน Final Approve' : 'หัวหน้างาน — คำขอลา Final Approve · แผนงาน Step 1'} />
      <Suspense fallback={null}>
        <BranchFilterBar role={role} filterBranchId={branchParam} />
      </Suspense>
      <ApprovalPanel
        leaveRequests={JSON.parse(JSON.stringify(leaveRequests))}
        outsideRequests={JSON.parse(JSON.stringify(outsideRequests))}
        weeklyPlans={JSON.parse(JSON.stringify(weeklyPlans))}
        userRole={role}
      />
    </div>
  )
}
