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
  const canViewAll = ['MANAGER_HR', 'ADMIN', 'HR', 'SUPER_ADMIN', 'MANAGER', 'TEAM_LEADER', 'CEO'].includes(session.user.role)
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
        userId={session.user.id}
        canViewAll={canViewAll}
        canApproveOutside={canApproveOutside}
        requests={requests.map((r) => {
          const raw = r as Record<string, unknown>
          return {
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
            googleMapsUrl:  raw.googleMapsUrl  as string | null ?? null,
            attachmentUrl:  raw.attachmentUrl  as string | null ?? null,
            attachmentName: raw.attachmentName as string | null ?? null,
            approvalStatus: raw.approvalStatus as string | null ?? null,
            employeeName:   raw.employeeName   as string | null ?? null,
            ownerName:      raw.ownerName      as string | null ?? null,
            workType:       raw.workType       as string | null ?? null,
            distance:       raw.distance       as number | null ?? null,
            distanceLimit:  raw.distanceLimit  as number | null ?? null,
            routeType:      raw.routeType      as string | null ?? null,
            timeSlot:       raw.timeSlot       as string | null ?? null,
            caseNumber:     raw.caseNumber     as string | null ?? null,
            productWork:    raw.productWork    as string | null ?? null,
            workBranch:     raw.workBranch     as string | null ?? null,
            caseCount:      raw.caseCount      as number | null ?? null,
            adminChecked:   raw.adminChecked   as string | null ?? null,
            supervisedBy:   raw.supervisedBy   as string | null ?? null,
          }
        })}
      />
    </div>
  )
}
