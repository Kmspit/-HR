import type { PrismaClient, RequestStatus, Role } from '@prisma/client'
import { hasPermission } from '@/lib/access-control'
import { canPerformApproval } from '@/lib/approval-permissions'
import { getDirectReportUserIds, isCompanyWideApprover } from '@/lib/org-scope'
import {
  getPendingForgotScanForApprover,
  getPendingLeaveForApprover,
  getPendingOutsideForApprover,
  getPendingWeeklyForApprover,
} from '@/lib/approval-inbox'
import type {
  InboxForgotScanItem,
  InboxLeaveItem,
  InboxOutsideItem,
  InboxWeeklyItem,
} from '@/lib/approval-inbox'
import { LEAVE_TYPE_LABELS } from '@/lib/leave-types'
import { formatThaiDate, formatThaiDateTime } from '@/lib/utils'
import { canManageApprovalChains } from './access'
import { STATUS_LABELS } from './constants'
import type {
  ApprovalCenterCounts,
  ApprovalCenterPayload,
  ApprovalType,
  UnifiedApprovalItem,
} from './types'

const SCAN_LABELS: Record<string, string> = {
  checkin: 'เข้างาน',
  'lunch-out': 'พักกลางวันออก',
  'lunch-in': 'กลับจากพัก',
  checkout: 'ออกงาน',
}

const HR_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

type ScopeSet = Set<string> | 'ALL'

async function resolveScopeUserIds(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<ScopeSet> {
  if (isCompanyWideApprover(role) || HR_ROLES.includes(role)) return 'ALL'
  const reports = await getDirectReportUserIds(prisma, userId, role)
  return new Set(reports)
}

function inEmployeeScope(employeeId: string, scope: ScopeSet): boolean {
  if (scope === 'ALL') return true
  return scope.has(employeeId)
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

function mapLeave(row: InboxLeaveItem, canAct: boolean, createdAt: Date): UnifiedApprovalItem {
  return {
    id: row.id,
    type: 'LEAVE',
    employeeName: row.user.name,
    employeeId: row.user.id,
    department: row.user.department,
    requestTypeLabel: LEAVE_TYPE_LABELS[row.type] ?? row.type,
    submittedAt: createdAt.toISOString(),
    currentStep: row.stepName ?? (row.status === 'PENDING' ? `ขั้น ${row.currentStepOrder}` : null),
    status: row.status,
    statusLabel: statusLabel(row.status),
    summary: `${row.days} วัน · ${formatThaiDate(row.startDate)} — ${formatThaiDate(row.endDate)}`,
    canAct,
    deepLink: '/leave',
    detailFields: [
      { label: 'ประเภทลา', value: LEAVE_TYPE_LABELS[row.type] ?? row.type },
      { label: 'ช่วงวันที่', value: `${formatThaiDate(row.startDate)} — ${formatThaiDate(row.endDate)}` },
      { label: 'จำนวนวัน', value: `${row.days} วัน` },
      { label: 'เหตุผล', value: row.reason || '—' },
      { label: 'อีเมล', value: row.user.email },
    ],
  }
}

function mapOutside(row: InboxOutsideItem, canAct: boolean, createdAt: Date): UnifiedApprovalItem {
  return {
    id: row.id,
    type: 'OUTSIDE',
    employeeName: row.user.name,
    employeeId: row.user.id,
    department: row.user.department,
    requestTypeLabel: 'ออกนอกสถานที่',
    submittedAt: createdAt.toISOString(),
    currentStep: row.stepName ?? (row.status === 'PENDING' ? `ขั้น ${row.currentStepOrder}` : null),
    status: row.status,
    statusLabel: statusLabel(row.status),
    summary: `${row.place} · ${formatThaiDate(row.date)} ${row.startTime}—${row.endTime}`,
    canAct,
    deepLink: '/outside-work',
    detailFields: [
      { label: 'วันที่', value: formatThaiDate(row.date) },
      { label: 'เวลา', value: `${row.startTime} — ${row.endTime}` },
      { label: 'สถานที่', value: row.place },
      { label: 'วัตถุประสงค์', value: row.purpose },
      { label: 'อีเมล', value: row.user.email },
    ],
  }
}

function mapWeekly(
  row: InboxWeeklyItem & { lawyerId?: string; department?: string | null },
  canAct: boolean,
  createdAt: Date,
): UnifiedApprovalItem {
  return {
    id: row.id,
    type: 'WEEKLY_PLAN',
    employeeName: row.lawyer.name,
    employeeId: row.lawyerId ?? '',
    department: row.department ?? null,
    requestTypeLabel: 'แผนงานสัปดาห์',
    submittedAt: createdAt.toISOString(),
    currentStep: row.stepName ?? (row.status === 'PENDING' ? 'รออนุมัติ' : null),
    status: row.status,
    statusLabel: statusLabel(row.status),
    summary: `${formatThaiDate(row.weekStart)} — ${formatThaiDate(row.weekEnd)}${row.isLate ? ' · ส่งช้า' : ''}`,
    canAct,
    deepLink: '/weekly-plan',
    detailFields: [
      { label: 'สัปดาห์', value: `${formatThaiDate(row.weekStart)} — ${formatThaiDate(row.weekEnd)}` },
      { label: 'ทนาย', value: row.lawyer.name },
      { label: 'อีเมล', value: row.lawyer.email },
      { label: 'หมายเหตุ', value: row.note || '—' },
      { label: 'จำนวนวันในแผน', value: `${row.days.length} วัน` },
    ],
  }
}

function mapForgot(row: InboxForgotScanItem, canAct: boolean, createdAt: Date): UnifiedApprovalItem {
  return {
    id: row.id,
    type: 'FORGOT_SCAN',
    employeeName: row.user.name,
    employeeId: row.user.id,
    department: row.user.department,
    requestTypeLabel: 'แก้เวลาลงงาน',
    submittedAt: createdAt.toISOString(),
    currentStep: row.stepName ?? (row.status === 'PENDING' ? 'รออนุมัติ' : null),
    status: row.status,
    statusLabel: statusLabel(row.status),
    summary: `${SCAN_LABELS[row.scanType] ?? row.scanType} · ${formatThaiDate(row.date)}`,
    canAct,
    deepLink: '/forgot-scan',
    detailFields: [
      { label: 'วันที่', value: formatThaiDate(row.date) },
      { label: 'ประเภท', value: SCAN_LABELS[row.scanType] ?? row.scanType },
      { label: 'เวลาที่ถูกต้อง', value: formatThaiDateTime(row.correctTime) },
      { label: 'เหตุผล', value: row.reason || '—' },
      { label: 'อีเมล', value: row.user.email },
    ],
  }
}

async function loadApprovedRejected(
  prisma: PrismaClient,
  userId: string,
  role: Role,
  bucket: 'approved' | 'rejected',
): Promise<UnifiedApprovalItem[]> {
  const scope = await resolveScopeUserIds(prisma, userId, role)
  const leaveStatus: RequestStatus[] = bucket === 'approved' ? ['APPROVED'] : ['REJECTED']
  const outsideStatus: RequestStatus[] = bucket === 'approved' ? ['APPROVED'] : ['REJECTED']
  const weeklyStatus: RequestStatus[] = bucket === 'approved' ? ['APPROVED'] : ['REJECTED']
  const forgotStatus: RequestStatus[] = bucket === 'approved' ? ['APPROVED'] : ['REJECTED', 'ADMIN_REJECTED']

  const [leaves, outside, weekly, forgot] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: { in: leaveStatus } },
      include: { user: { select: { id: true, name: true, email: true, department: true, position: true, role: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 60,
    }),
    prisma.outsideWorkRequest.findMany({
      where: { status: { in: outsideStatus } },
      include: { user: { select: { id: true, name: true, email: true, department: true, position: true, role: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 60,
    }),
    prisma.weeklyLawyerPlan.findMany({
      where: { status: { in: weeklyStatus } },
      include: {
        lawyer: { select: { id: true, name: true, email: true, department: true } },
        days: { select: { dayOfWeek: true, place: true, purpose: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 40,
    }),
    prisma.forgotScanRequest.findMany({
      where: { status: { in: forgotStatus } },
      include: { user: { select: { id: true, name: true, email: true, department: true, position: true, role: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 60,
    }),
  ])

  const out: UnifiedApprovalItem[] = []

  for (const row of leaves) {
    if (!inEmployeeScope(row.userId, scope)) continue
    out.push(
      mapLeave(
        {
          id: row.id,
          type: row.type,
          startDate: row.startDate,
          endDate: row.endDate,
          days: row.days,
          reason: row.reason,
          status: row.status,
          chainConfigId: row.chainConfigId,
          currentStepOrder: row.currentStepOrder,
          stepName: bucket === 'approved' ? 'เสร็จสิ้น' : null,
          user: row.user,
        },
        false,
        row.createdAt,
      ),
    )
  }

  for (const row of outside) {
    if (!inEmployeeScope(row.userId, scope)) continue
    out.push(
      mapOutside(
        {
          id: row.id,
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
          place: row.place,
          purpose: row.purpose,
          status: row.status,
          approvalStatus: row.approvalStatus,
          chainConfigId: row.chainConfigId,
          currentStepOrder: row.currentStepOrder,
          stepName: bucket === 'approved' ? 'เสร็จสิ้น' : null,
          user: row.user,
        },
        false,
        row.createdAt,
      ),
    )
  }

  for (const row of weekly) {
    if (!inEmployeeScope(row.lawyerId, scope)) continue
    out.push(
      mapWeekly(
        {
          id: row.id,
          weekStart: row.weekStart,
          weekEnd: row.weekEnd,
          status: row.status,
          isLate: row.isLate,
          note: row.note,
          stepName: bucket === 'approved' ? 'เสร็จสิ้น' : null,
          lawyer: { name: row.lawyer.name, email: row.lawyer.email },
          lawyerId: row.lawyerId,
          department: row.lawyer.department,
          days: row.days,
        },
        false,
        row.createdAt,
      ),
    )
  }

  for (const row of forgot) {
    if (!inEmployeeScope(row.userId, scope)) continue
    out.push(
      mapForgot(
        {
          id: row.id,
          date: row.date,
          scanType: row.scanType,
          correctTime: row.correctTime,
          reason: row.reason,
          status: row.status,
          stepName: bucket === 'approved' ? 'เสร็จสิ้น' : null,
          user: row.user,
        },
        false,
        row.createdAt,
      ),
    )
  }

  out.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  return out.slice(0, 80)
}

async function loadMyRequests(prisma: PrismaClient, userId: string): Promise<UnifiedApprovalItem[]> {
  const [leaves, outside, weekly, forgot] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId },
      include: { user: { select: { id: true, name: true, email: true, department: true, position: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    prisma.outsideWorkRequest.findMany({
      where: { userId },
      include: { user: { select: { id: true, name: true, email: true, department: true, position: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    prisma.weeklyLawyerPlan.findMany({
      where: { lawyerId: userId },
      include: {
        lawyer: { select: { id: true, name: true, email: true, department: true } },
        days: { select: { dayOfWeek: true, place: true, purpose: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.forgotScanRequest.findMany({
      where: { userId },
      include: { user: { select: { id: true, name: true, email: true, department: true, position: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ])

  const out: UnifiedApprovalItem[] = []

  for (const row of leaves) {
    out.push(
      mapLeave(
        {
          id: row.id,
          type: row.type,
          startDate: row.startDate,
          endDate: row.endDate,
          days: row.days,
          reason: row.reason,
          status: row.status,
          chainConfigId: row.chainConfigId,
          currentStepOrder: row.currentStepOrder,
          stepName: row.status === 'PENDING' ? `ขั้น ${row.currentStepOrder}` : null,
          user: row.user,
        },
        false,
        row.createdAt,
      ),
    )
  }
  for (const row of outside) {
    out.push(
      mapOutside(
        {
          id: row.id,
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
          place: row.place,
          purpose: row.purpose,
          status: row.status,
          approvalStatus: row.approvalStatus,
          chainConfigId: row.chainConfigId,
          currentStepOrder: row.currentStepOrder,
          stepName: row.status === 'PENDING' ? `ขั้น ${row.currentStepOrder}` : null,
          user: row.user,
        },
        false,
        row.createdAt,
      ),
    )
  }
  for (const row of weekly) {
    out.push(
      mapWeekly(
        {
          id: row.id,
          weekStart: row.weekStart,
          weekEnd: row.weekEnd,
          status: row.status,
          isLate: row.isLate,
          note: row.note,
          stepName: row.status === 'PENDING' ? 'รออนุมัติ' : null,
          lawyer: { name: row.lawyer.name, email: row.lawyer.email },
          lawyerId: row.lawyerId,
          department: row.lawyer.department,
          days: row.days,
        },
        false,
        row.createdAt,
      ),
    )
  }
  for (const row of forgot) {
    out.push(
      mapForgot(
        {
          id: row.id,
          date: row.date,
          scanType: row.scanType,
          correctTime: row.correctTime,
          reason: row.reason,
          status: row.status,
          stepName: row.status === 'PENDING' ? 'รออนุมัติ' : null,
          user: row.user,
        },
        false,
        row.createdAt,
      ),
    )
  }

  out.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  return out
}

async function loadPendingWithMeta(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<UnifiedApprovalItem[]> {
  const canWeekly = hasPermission(role, 'approve_weekly_plan') || role === 'CEO'

  const [leave, outside, weekly, forgot] = await Promise.all([
    getPendingLeaveForApprover(prisma, userId, role),
    getPendingOutsideForApprover(prisma, userId, role),
    canWeekly ? getPendingWeeklyForApprover(prisma, userId, role) : Promise.resolve([]),
    getPendingForgotScanForApprover(prisma, userId, role),
  ])

  const leaveIds = leave.map((l) => l.id)
  const leaveDates = leaveIds.length
    ? await prisma.leaveRequest.findMany({ where: { id: { in: leaveIds } }, select: { id: true, createdAt: true } })
    : []
  const leaveCreated = new Map(leaveDates.map((r) => [r.id, r.createdAt]))

  const outsideIds = outside.map((o) => o.id)
  const outsideDates = outsideIds.length
    ? await prisma.outsideWorkRequest.findMany({ where: { id: { in: outsideIds } }, select: { id: true, createdAt: true } })
    : []
  const outsideCreated = new Map(outsideDates.map((r) => [r.id, r.createdAt]))

  const weeklyIds = weekly.map((w) => w.id)
  const weeklyRows = weeklyIds.length
    ? await prisma.weeklyLawyerPlan.findMany({
        where: { id: { in: weeklyIds } },
        select: { id: true, createdAt: true, lawyerId: true, lawyer: { select: { department: true } } },
      })
    : []
  const weeklyMeta = new Map(weeklyRows.map((r) => [r.id, r]))

  const forgotIds = forgot.map((f) => f.id)
  const forgotDates = forgotIds.length
    ? await prisma.forgotScanRequest.findMany({ where: { id: { in: forgotIds } }, select: { id: true, createdAt: true } })
    : []
  const forgotCreated = new Map(forgotDates.map((r) => [r.id, r.createdAt]))

  const out: UnifiedApprovalItem[] = []

  for (const row of leave) {
    out.push(mapLeave(row, canPerformApproval(role, 'LEAVE'), leaveCreated.get(row.id) ?? new Date()))
  }
  for (const row of outside) {
    out.push(mapOutside(row, canPerformApproval(role, 'OUTSIDE'), outsideCreated.get(row.id) ?? new Date()))
  }
  for (const row of weekly) {
    const meta = weeklyMeta.get(row.id)
    out.push(
      mapWeekly(
        { ...row, lawyerId: meta?.lawyerId, department: meta?.lawyer.department ?? null },
        canPerformApproval(role, 'WEEKLY_PLAN'),
        meta?.createdAt ?? new Date(),
      ),
    )
  }
  for (const row of forgot) {
    out.push(mapForgot(row, canPerformApproval(role, 'FORGOT_SCAN'), forgotCreated.get(row.id) ?? new Date()))
  }

  out.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  return out
}

function collectDepartments(items: UnifiedApprovalItem[]): string[] {
  const set = new Set<string>()
  for (const i of items) {
    const d = i.department?.trim()
    if (d) set.add(d)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'th'))
}

function buildCounts(
  pending: UnifiedApprovalItem[],
  approved: UnifiedApprovalItem[],
  rejected: UnifiedApprovalItem[],
  mine: UnifiedApprovalItem[],
): ApprovalCenterCounts {
  const byType: Record<ApprovalType, number> = {
    LEAVE: 0,
    OUTSIDE: 0,
    WEEKLY_PLAN: 0,
    FORGOT_SCAN: 0,
  }
  for (const item of pending) byType[item.type] += 1
  return {
    pending: pending.length,
    approved: approved.length,
    rejected: rejected.length,
    mine: mine.length,
    byType,
  }
}

export async function loadApprovalCenterData(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<ApprovalCenterPayload> {
  const [pending, approved, rejected, myRequests] = await Promise.all([
    loadPendingWithMeta(prisma, userId, role),
    loadApprovedRejected(prisma, userId, role, 'approved'),
    loadApprovedRejected(prisma, userId, role, 'rejected'),
    loadMyRequests(prisma, userId),
  ])

  const all = [...pending, ...approved, ...rejected, ...myRequests]

  return {
    pending,
    approved,
    rejected,
    myRequests,
    departments: collectDepartments(all),
    counts: buildCounts(pending, approved, rejected, myRequests),
    userRole: role,
    canManageChains: canManageApprovalChains(role),
  }
}
