import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import OutsideWorkClient from './OutsideWorkClient'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import { buildBranchScope, branchNestedUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import { Suspense } from 'react'
import { hasPermission } from '@/lib/access-control'
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
  const pageShell = (requests: Parameters<typeof OutsideWorkClient>[0]['requests']) => (
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
        userName={session.user.name ?? ''}
        currentUserRole={session.user.role as Role}
        canViewAll={canViewAll}
        canApproveOutside={canApproveOutside}
        requests={requests}
      />
    </div>
  )

  try {
    const rows = await prisma.outsideWorkRequest.findMany({
      where: canViewAll
        ? nestedUser
          ? { user: nestedUser }
          : {}
        : { userId: session.user.id },
      include: {
        user: { select: { name: true, department: true, position: true } },
        stepLogs: {
          orderBy: { stepOrder: 'asc' },
          include: { actor: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: canViewAll ? 200 : 100,
    })

    return pageShell(rows.map((r) => ({
      id:            r.id,
      userId:        r.userId,
      userName:      r.user.name,
      userDept:      r.user.department  ?? '',
      userPosition:  r.user.position    ?? '',
      date:          r.date.toISOString(),
      startTime:     r.startTime,
      endTime:       r.endTime,
      place:         r.place,
      purpose:       r.purpose,
      client:        r.client           ?? '',
      note:          r.note             ?? '',
      status:        r.status,
      chainConfigId: r.chainConfigId ?? null,
      currentStepOrder: r.currentStepOrder ?? 0,
      steps: r.stepLogs.map((s) => ({
        id: s.id,
        stepOrder: s.stepOrder,
        stepName: s.stepName,
        approverRole: s.approverRole,
        approverId: s.approverId,
        status: s.status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED',
        actorId: s.actorId,
        comment: s.comment,
        actedAt: s.actedAt,
        actor: s.actor,
      })),
      createdAt:     r.createdAt.toISOString(),
      googleMapsUrl:  r.googleMapsUrl   ?? null,
      attachmentUrl:  r.attachmentUrl   ?? null,
      attachmentName: r.attachmentName  ?? null,
      approvalStatus: r.approvalStatus  ?? null,
      employeeName:   r.employeeName    ?? null,
      ownerName:      r.ownerName       ?? null,
      workType:       r.workType        ?? null,
      distance:       r.distance        ?? null,
      distanceLimit:  r.distanceLimit   ?? null,
      routeType:      r.routeType       ?? null,
      timeSlot:       r.timeSlot        ?? null,
      caseNumber:     r.caseNumber      ?? null,
      productWork:    r.productWork     ?? null,
      workBranch:     r.workBranch      ?? null,
      caseCount:      r.caseCount       ?? null,
      adminChecked:   r.adminChecked    ?? null,
      supervisedBy:   r.supervisedBy    ?? null,
      documentNumber: r.documentNumber  ?? null,
    })))
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; meta?: unknown }
    console.error('[outside-work PAGE ERROR]', err?.message, err?.code, JSON.stringify(err?.meta))
    // findMany failed — show empty state, do not crash
    return pageShell([])
  }
}
