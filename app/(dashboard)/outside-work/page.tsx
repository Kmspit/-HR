import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import OutsideWorkClient from './OutsideWorkClient'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import { buildBranchScope, branchNestedUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import { Suspense } from 'react'
import { hasPermission } from '@/lib/rbac'
import type { Role } from '@prisma/client'

export default async function OutsideWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const sp = await searchParams
  const branchParam = parseBranchQueryParam(sp.branchId)
  const canViewAll = ['MANAGER_HR', 'ADMIN', 'HR', 'SUPER_ADMIN', 'MANAGER', 'TEAM_LEADER'].includes(session.user.role)
  const canApproveOutside = hasPermission(session.user.role as Role, 'approve_outside_work')
  const scope = buildBranchScope(session.user, { branchId: branchParam })
  const nestedUser = canViewAll ? branchNestedUserWhere(scope) : undefined

  const requests = await prisma.outsideWorkRequest.findMany({
    where: canViewAll
      ? nestedUser
        ? { user: nestedUser }
        : {}
      : { userId: session.user.id },
    include: {
      user: { select: { name: true, department: true, position: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: canViewAll ? 200 : 100,
  })

  return (
    <div className="flex flex-col">
      <Topbar
        title="ออกนอกสถานที่"
        subtitle={
          canViewAll
            ? 'ยื่นคำขอได้เหมือนพนักงานทั่วไป · ดูประวัติทุกคนได้'
            : 'ยื่นคำขอและดูประวัติของตัวเอง'
        }
      />
      {canViewAll && (
        <Suspense fallback={null}>
          <BranchFilterBar role={session.user.role} filterBranchId={branchParam} />
        </Suspense>
      )}
      <OutsideWorkClient
        canViewAll={canViewAll}
        canApproveOutside={canApproveOutside}
        requests={requests.map((r) => ({
          id: r.id,
          userId: r.userId,
          userName: r.user.name,
          userDept: r.user.department ?? '',
          userPosition: r.user.position ?? '',
          date: r.date.toISOString(),
          startTime: r.startTime,
          endTime: r.endTime,
          place: r.place,
          purpose: r.purpose,
          client: r.client ?? '',
          note: r.note ?? '',
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  )
}
