import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import WarningsClient from './WarningsClient'
import { WARNING_TARGET_USER_SELECT, WARNING_TARGET_USER_WHERE } from '@/lib/warning-employees'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import {
  buildBranchScope,
  branchUserWhere,
  resolveFilterBranchId,
  parseBranchQueryParam,
} from '@/lib/branch-scope'
import { canApproveWarning } from '@/lib/rbac'
import { archiveExpiredWarnings } from '@/lib/warning-auto'
import { Suspense } from 'react'
import type { Role } from '@prisma/client'

export default async function WarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/')  archiveExpiredWarnings().catch(() => {})

  const sp = await searchParams
  const branchParam = parseBranchQueryParam(sp.branchId)
  const scope = buildBranchScope(session.user, { branchId: branchParam })
  const isManager = ['MANAGER_HR', 'ADMIN', 'HR', 'SUPER_ADMIN'].includes(session.user.role)
  const canApprove = canApproveWarning(session.user.role as Role)
  const filterBranch = resolveFilterBranchId(scope)

  type EmployeeRow = {
    id: string
    name: string
    department: string | null
    employeeId: string | null
    _count: { warnings: number }
  }

  let warnings: Awaited<ReturnType<typeof prisma.warning.findMany<{
    include: {
      user: { select: { name: true; employeeId: true; department: true; position: true } }
      approvedBy: { select: { id: true; name: true } }
      rejectedBy: { select: { id: true; name: true } }
    }
  }>>>
  let employees: EmployeeRow[]

  try {
    ;[warnings, employees] = await Promise.all([
      prisma.warning.findMany({
        where: isManager
          ? (filterBranch ? { user: { branchId: filterBranch } } : {})
          : { userId: session.user.id, status: 'APPROVED' },
        include: {
          user:       { select: { name: true, employeeId: true, department: true, position: true } },
          approvedBy: { select: { id: true, name: true } },
          rejectedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      isManager
        ? prisma.user.findMany({
            where: branchUserWhere(scope, WARNING_TARGET_USER_WHERE),
            select: WARNING_TARGET_USER_SELECT,
            orderBy: { name: 'asc' },
          })
        : [],
    ])
  } catch (err) {
    console.error('[warnings-page]', err)
    return (
      <div className="flex flex-col">
        <Topbar title="ใบเตือน" subtitle="ไม่สามารถโหลดข้อมูลได้ชั่วคราว" />
        <div className="p-6">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-200">
            <p className="font-medium">เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล</p>
            <p className="mt-2 text-sm text-red-200/80">
              กรุณารีเฟรชหน้านี้อีกครั้ง หากยังเข้าไม่ได้ แจ้งผู้ดูแลระบบให้รัน{' '}
              <code className="text-xs">npm run db:migrate:turso</code>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <Topbar
        title="ใบเตือน"
        subtitle={
          isManager
            ? 'ออกใบเตือน · อนุมัติใบเตือนอัตโนมัติ · แนบ PDF'
            : 'ประวัติใบเตือนของตัวเอง'
        }
      />
      {isManager && (
        <Suspense fallback={null}>
          <BranchFilterBar role={session.user.role} filterBranchId={branchParam} />
        </Suspense>
      )}
      <WarningsClient
        isManager={isManager}
        canApprove={canApprove}
        warnings={warnings.map((w) => ({
          id: w.id,
          userId: w.userId,
          userName: w.user.name,
          userDept: w.user.department ?? '',
          userPosition: w.user.position ?? '',
          employeeId: w.user.employeeId ?? '',
          reason: w.reason,
          description: w.description ?? '',
          fileUrl: w.fileUrl ?? null,
          sentToLine: w.sentToLine,
          lineDeliveryStatus: w.lineDeliveryStatus ?? null,
          lineSentAt: w.lineSentAt?.toISOString() ?? null,
          lineUserId: w.lineUserId ?? null,
          lineErrorMessage: w.lineErrorMessage ?? null,
          isAuto: w.isAuto,
          month: w.month ?? null,
          year: w.year ?? null,
          lateCount: (w as unknown as { lateCount?: number }).lateCount ?? null,
          status: (w as unknown as { status?: string }).status ?? 'APPROVED',
          expiredAt: (w as unknown as { expiredAt?: Date }).expiredAt?.toISOString() ?? null,
          approvedAt: (w as unknown as { approvedAt?: Date }).approvedAt?.toISOString() ?? null,
          approvedByName: w.approvedBy?.name ?? null,
          rejectedByName: w.rejectedBy?.name ?? null,
          rejectedReason: (w as unknown as { rejectedReason?: string }).rejectedReason ?? null,
          createdAt: w.createdAt.toISOString(),
        }))}
        employees={employees.map((e) => ({
          id: e.id,
          name: e.name,
          department: e.department ?? '',
          employeeId: e.employeeId ?? '',
          warningCount: e._count.warnings,
        }))}
      />
    </div>
  )
}
