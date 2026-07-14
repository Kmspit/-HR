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
import { getCachedCompanySettings } from '@/lib/company-settings-cache'
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
  const companySettings = await getCachedCompanySettings().catch(() => null)
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
        companyName={companySettings?.companyName}
        outsideWorkPlanTitle={companySettings?.outsideWorkPlanTitle}
      />
    </div>
  )

  try {
    const rows = await prisma.outsideWorkRequest.findMany({
      where: {
        ...(canViewAll
          ? nestedUser
            ? { user: nestedUser }
            : {}
          : { userId: session.user.id }),
        deletedAt: null,
      },
      select: {
        id: true, userId: true, date: true, startTime: true, endTime: true,
        place: true, purpose: true, client: true, note: true, status: true,
        chainConfigId: true, currentStepOrder: true, createdAt: true,
        googleMapsUrl: true, attachmentUrl: true, attachmentName: true, approvalStatus: true,
        employeeName: true, ownerName: true, workType: true, distance: true, distanceLimit: true, routeType: true,
        timeSlot: true, caseNumber: true, productWork: true, productCategory: true, productType: true,
        workBranch: true, caseCount: true, adminChecked: true, supervisedBy: true, documentNumber: true,
        clientCompanyId: true,
        clientCompany: { select: { companyName: true } },
        user: { select: { name: true, department: true, position: true } },
        assignees: { select: { user: { select: { id: true, name: true } } } },
        stepLogs: {
          select: {
            id: true, stepOrder: true, stepName: true, approverRole: true, approverId: true,
            status: true, actorId: true, comment: true, actedAt: true,
            actor: { select: { name: true } },
          },
          orderBy: { stepOrder: 'asc' },
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
      productCategory: r.productCategory ?? null,
      productType:     r.productType     ?? null,
      workBranch:     r.workBranch      ?? null,
      caseCount:      r.caseCount       ?? null,
      adminChecked:   r.adminChecked    ?? null,
      supervisedBy:   r.supervisedBy    ?? null,
      documentNumber: r.documentNumber  ?? null,
      clientCompanyId:   r.clientCompanyId ?? null,
      clientCompanyName: r.clientCompany?.companyName ?? null,
      assignees: r.assignees.map((a) => ({ id: a.user.id, name: a.user.name })),
    })))
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; meta?: unknown }
    console.error('[outside-work PAGE ERROR]', err?.message, err?.code, JSON.stringify(err?.meta))
    // findMany failed — show empty state, do not crash
    return pageShell([])
  }
}
