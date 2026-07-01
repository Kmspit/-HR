import type { PrismaClient } from '@prisma/client'
import { LEAVE_TYPE_LABELS } from '@/lib/leave-types'
import { formatThaiDate, formatThaiDateTime } from '@/lib/utils'
import {
  APPROVAL_STEP_STATUS,
  ATTENDANCE_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  SCAN_TYPE_LABELS,
  formatTimelineTime,
  statusToneFromAttendance,
  statusToneFromRequest,
  statusToneFromWarning,
} from './constants'
import type { EmployeeTimelinePayload, TimelineEvent } from './types'
import { computeFilterCounts } from './types'

function toneFromStepStatus(status: string): TimelineEvent['statusTone'] {
  if (status === 'APPROVED') return 'success'
  if (status === 'REJECTED') return 'danger'
  return 'info'
}

function parseSalaryFromAudit(before: string | null, after: string | null): { from?: number; to?: number } | null {
  try {
    const b = before ? JSON.parse(before) as { baseSalary?: number } : {}
    const a = after ? JSON.parse(after) as { baseSalary?: number } : {}
    if (b.baseSalary === undefined && a.baseSalary === undefined) return null
    if (b.baseSalary === a.baseSalary) return null
    return { from: b.baseSalary, to: a.baseSalary }
  } catch {
    return null
  }
}

const MONTH_NAMES = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export async function loadEmployeeTimeline(
  prisma: PrismaClient,
  userId: string,
): Promise<EmployeeTimelinePayload | null> {
  const employee = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      employeeId: true,
      department: true,
      position: true,
      role: true,
      startDate: true,
    },
  })
  if (!employee) return null

  const [
    attendances,
    leaves,
    outsideWorks,
    warnings,
    payrolls,
    salaryAudits,
    leaveSteps,
    outsideSteps,
    forgotSteps,
    weeklySteps,
    forgotScans,
  ] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId },
      orderBy: [{ date: 'desc' }, { sessionIndex: 'desc' }],
      take: 120,
      select: {
        id: true, date: true, checkIn: true, checkOut: true, status: true,
        lateMinutes: true, isOutside: true, workPlaceName: true, sessionIndex: true,
        note: true, autoCheckout: true,
      },
    }),
    prisma.leaveRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: {
        id: true, type: true, startDate: true, endDate: true, days: true,
        reason: true, status: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.outsideWorkRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: {
        id: true, date: true, startTime: true, endTime: true, place: true,
        purpose: true, status: true, createdAt: true, documentNumber: true,
      },
    }),
    prisma.warning.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, level: true, reason: true, description: true, status: true,
        isAuto: true, lateCount: true, createdAt: true, approvedAt: true,
        issuedBy: { select: { name: true } },
      },
    }),
    prisma.payroll.findMany({
      where: { userId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 36,
      select: {
        id: true, month: true, year: true, baseSalary: true, netSalary: true,
        lateDeduction: true, absentDeduction: true, status: true, createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { targetId: userId, targetType: 'User', action: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true, before: true, after: true, createdAt: true,
        actor: { select: { name: true } },
      },
    }),
    prisma.leaveApprovalStep.findMany({
      where: {
        leaveRequest: { userId },
        status: { in: ['APPROVED', 'REJECTED', 'SKIPPED'] },
        actedAt: { not: null },
      },
      orderBy: { actedAt: 'desc' },
      take: 60,
      include: {
        actor: { select: { name: true } },
        leaveRequest: { select: { type: true, days: true } },
      },
    }),
    prisma.outsideWorkApprovalStep.findMany({
      where: {
        request: { userId },
        status: { in: ['APPROVED', 'REJECTED', 'SKIPPED'] },
        actedAt: { not: null },
      },
      orderBy: { actedAt: 'desc' },
      take: 60,
      include: {
        actor: { select: { name: true } },
        request: { select: { place: true, date: true } },
      },
    }),
    prisma.forgotScanApprovalStep.findMany({
      where: {
        request: { userId },
        status: { in: ['APPROVED', 'REJECTED', 'SKIPPED'] },
        actedAt: { not: null },
      },
      orderBy: { actedAt: 'desc' },
      take: 40,
      include: {
        actor: { select: { name: true } },
        request: { select: { scanType: true, date: true } },
      },
    }),
    prisma.weeklyPlanApprovalStep.findMany({
      where: {
        plan: { lawyerId: userId },
        status: { in: ['APPROVED', 'REJECTED', 'SKIPPED'] },
        actedAt: { not: null },
      },
      orderBy: { actedAt: 'desc' },
      take: 40,
      include: {
        actor: { select: { name: true } },
        plan: { select: { weekStart: true } },
      },
    }),
    prisma.forgotScanRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true, date: true, scanType: true, correctTime: true, reason: true,
        status: true, createdAt: true,
      },
    }),
  ])

  const events: TimelineEvent[] = []

  for (const row of attendances) {
    const eventDate = row.checkIn ?? row.date
    const statusLabel = ATTENDANCE_STATUS_LABELS[row.status] ?? row.status
    const parts = [
      row.checkIn ? `เข้า ${formatTimelineTime(row.checkIn)}` : null,
      row.checkOut ? `ออก ${formatTimelineTime(row.checkOut)}` : null,
      statusLabel,
      row.lateMinutes > 0 ? `สาย ${row.lateMinutes} น.` : null,
      row.isOutside ? 'นอกสถานที่' : null,
      row.workPlaceName ? `ที่ ${row.workPlaceName}` : null,
      row.sessionIndex > 1 ? `รอบที่ ${row.sessionIndex}` : null,
      row.autoCheckout ? 'Auto checkout' : null,
    ].filter(Boolean)

    events.push({
      id: `att-${row.id}`,
      date: eventDate.toISOString(),
      category: 'attendance',
      title: `บันทึกเข้างาน · ${formatThaiDate(row.date)}`,
      details: parts.join(' · ') || 'บันทึกเวลาทำงาน',
      status: statusLabel,
      statusTone: statusToneFromAttendance(row.status),
      link: '/attendance',
    })
  }

  for (const row of leaves) {
    const typeLabel = LEAVE_TYPE_LABELS[row.type] ?? row.type
    events.push({
      id: `leave-${row.id}`,
      date: row.createdAt.toISOString(),
      category: 'leave',
      title: `ขอลา · ${typeLabel}`,
      details: `${formatThaiDate(row.startDate)} – ${formatThaiDate(row.endDate)} · ${row.days} วัน · ${row.reason}`,
      status: REQUEST_STATUS_LABELS[row.status] ?? row.status,
      statusTone: statusToneFromRequest(row.status),
      link: '/leave',
    })
  }

  for (const row of outsideWorks) {
    events.push({
      id: `outside-${row.id}`,
      date: row.createdAt.toISOString(),
      category: 'outside',
      title: `ออกนอกสถานที่ · ${row.place}`,
      details: [
        formatThaiDate(row.date),
        `${row.startTime}–${row.endTime}`,
        row.purpose,
        row.documentNumber ? `เลขที่ ${row.documentNumber}` : null,
      ].filter(Boolean).join(' · '),
      status: REQUEST_STATUS_LABELS[row.status] ?? row.status,
      statusTone: statusToneFromRequest(row.status),
      link: '/outside-work',
    })
  }

  for (const row of forgotScans) {
    events.push({
      id: `forgot-${row.id}`,
      date: row.createdAt.toISOString(),
      category: 'attendance',
      title: `ขอแก้เวลา · ${SCAN_TYPE_LABELS[row.scanType] ?? row.scanType}`,
      details: `${formatThaiDate(row.date)} · เวลาที่ถูกต้อง ${formatThaiDateTime(row.correctTime)} · ${row.reason}`,
      status: REQUEST_STATUS_LABELS[row.status] ?? row.status,
      statusTone: statusToneFromRequest(row.status),
      link: '/forgot-scan',
    })
  }

  for (const row of warnings) {
    events.push({
      id: `warn-${row.id}`,
      date: (row.approvedAt ?? row.createdAt).toISOString(),
      category: 'warning',
      title: `ใบเตือน ระดับ ${row.level}${row.isAuto ? ' (อัตโนมัติ)' : ''}`,
      details: [
        row.reason,
        row.description,
        row.lateCount != null ? `มาสาย ${row.lateCount} ครั้ง` : null,
        row.issuedBy?.name ? `โดย ${row.issuedBy.name}` : null,
      ].filter(Boolean).join(' · '),
      status: row.status,
      statusTone: statusToneFromWarning(row.status),
      link: `/warnings/${row.id}`,
    })
  }

  for (const row of payrolls) {
    const monthLabel = `${MONTH_NAMES[row.month - 1]} ${row.year + 543}`
    events.push({
      id: `pay-${row.id}`,
      date: row.updatedAt.toISOString(),
      category: 'payroll',
      title: `เงินเดือน · ${monthLabel}`,
      details: [
        `ฐาน ฿${row.baseSalary.toLocaleString('th-TH')}`,
        `สุทธิ ฿${row.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
        row.lateDeduction > 0 ? `หักสาย ฿${row.lateDeduction.toFixed(2)}` : null,
        row.absentDeduction > 0 ? `หักขาด ฿${row.absentDeduction.toFixed(2)}` : null,
      ].filter(Boolean).join(' · '),
      status: row.status,
      statusTone: row.status === 'APPROVED' ? 'success' : row.status === 'DRAFT' ? 'warning' : 'info',
      link: '/payroll',
    })
  }

  for (const row of salaryAudits) {
    const change = parseSalaryFromAudit(row.before, row.after)
    if (!change) continue
    const fromStr = change.from != null ? `฿${change.from.toLocaleString('th-TH')}` : '—'
    const toStr = change.to != null ? `฿${change.to.toLocaleString('th-TH')}` : '—'
    events.push({
      id: `salary-${row.id}`,
      date: row.createdAt.toISOString(),
      category: 'payroll',
      title: 'ปรับเงินเดือน',
      details: `${fromStr} → ${toStr}${row.actor?.name ? ` · โดย ${row.actor.name}` : ''}`,
      status: 'อัปเดต',
      statusTone: 'info',
      link: `/employees/${userId}`,
    })
  }

  for (const step of leaveSteps) {
    if (!step.actedAt) continue
    const typeLabel = LEAVE_TYPE_LABELS[step.leaveRequest.type] ?? step.leaveRequest.type
    events.push({
      id: `leave-step-${step.id}`,
      date: step.actedAt.toISOString(),
      category: 'approval',
      title: `อนุมัติลา · ${step.stepName}`,
      details: `${typeLabel} · ${step.leaveRequest.days} วัน${step.actor?.name ? ` · โดย ${step.actor.name}` : ''}${step.comment ? ` · ${step.comment}` : ''}`,
      status: APPROVAL_STEP_STATUS[step.status] ?? step.status,
      statusTone: toneFromStepStatus(step.status),
      link: '/approval-center',
    })
  }

  for (const step of outsideSteps) {
    if (!step.actedAt) continue
    events.push({
      id: `outside-step-${step.id}`,
      date: step.actedAt.toISOString(),
      category: 'approval',
      title: `อนุมัติออกนอก · ${step.stepName}`,
      details: `${step.request.place} · ${formatThaiDate(step.request.date)}${step.actor?.name ? ` · โดย ${step.actor.name}` : ''}${step.comment ? ` · ${step.comment}` : ''}`,
      status: APPROVAL_STEP_STATUS[step.status] ?? step.status,
      statusTone: toneFromStepStatus(step.status),
      link: '/approval-center',
    })
  }

  for (const step of forgotSteps) {
    if (!step.actedAt) continue
    events.push({
      id: `forgot-step-${step.id}`,
      date: step.actedAt.toISOString(),
      category: 'approval',
      title: `อนุมัติแก้เวลา · ${step.stepName}`,
      details: `${SCAN_TYPE_LABELS[step.request.scanType] ?? step.request.scanType} · ${formatThaiDate(step.request.date)}${step.actor?.name ? ` · โดย ${step.actor.name}` : ''}`,
      status: APPROVAL_STEP_STATUS[step.status] ?? step.status,
      statusTone: toneFromStepStatus(step.status),
      link: '/approval-center',
    })
  }

  for (const step of weeklySteps) {
    if (!step.actedAt) continue
    events.push({
      id: `weekly-step-${step.id}`,
      date: step.actedAt.toISOString(),
      category: 'approval',
      title: `อนุมัติแผนงาน · ${step.stepName}`,
      details: `สัปดาห์ ${formatThaiDate(step.plan.weekStart)}${step.actor?.name ? ` · โดย ${step.actor.name}` : ''}`,
      status: APPROVAL_STEP_STATUS[step.status] ?? step.status,
      statusTone: toneFromStepStatus(step.status),
      link: '/approval-center',
    })
  }

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      employeeId: employee.employeeId,
      department: employee.department,
      position: employee.position,
      role: employee.role,
      startDate: employee.startDate?.toISOString() ?? null,
    },
    events,
    counts: computeFilterCounts(events),
  }
}
