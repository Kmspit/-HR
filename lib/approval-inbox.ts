import type { PrismaClient, Role } from '@prisma/client'
import { canUserActOnStep } from '@/lib/approval-chain-shared'
import { canApproverActOnRequester } from '@/lib/org-scope'
import { hasPermission } from '@/lib/access-control'

const FORGOT_SCAN_SUPERVISOR: Role[] = ['MANAGER', 'TEAM_LEADER', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO']
const FORGOT_SCAN_HR: Role[] = ['HR', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'CEO']

export type InboxForgotScanItem = {
  id: string
  date: Date
  scanType: string
  correctTime: Date
  reason: string
  status: string
  stepName: string | null
  user: { id: string; name: string; email: string; department: string | null; position: string | null; role: Role }
}
export type InboxLeaveItem = {
  id: string
  type: string
  startDate: Date
  endDate: Date
  days: number
  reason: string
  status: string
  chainConfigId: string | null
  currentStepOrder: number
  stepName: string | null
  user: { id: string; name: string; email: string; department: string | null; position: string | null; role: Role }
}

export type InboxOutsideItem = {
  id: string
  date: Date
  startTime: string
  endTime: string
  place: string
  purpose: string
  status: string
  approvalStatus: string | null
  chainConfigId: string | null
  currentStepOrder: number
  stepName: string | null
  user: { id: string; name: string; email: string; department: string | null; position: string | null; role: Role }
}

export async function getPendingLeaveForApprover(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<InboxLeaveItem[]> {
  const rows = await prisma.leaveRequest.findMany({
    where: {
      status: { notIn: ['APPROVED', 'REJECTED'] },
    },
    include: {
      user: { select: { id: true, name: true, email: true, department: true, position: true, role: true } },
      stepLogs: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 150,
  })

  const out: InboxLeaveItem[] = []
  for (const row of rows) {
    if (row.chainConfigId) {
      const step = row.stepLogs.find(
        (s) => s.stepOrder === row.currentStepOrder && s.status === 'PENDING',
      )
      if (!step) continue
      if (!canUserActOnStep(step, userId, role)) continue
      if (!(await canApproverActOnRequester(prisma, userId, role, row.userId))) continue
      out.push({
        id: row.id,
        type: row.type,
        startDate: row.startDate,
        endDate: row.endDate,
        days: row.days,
        reason: row.reason,
        status: row.status,
        chainConfigId: row.chainConfigId,
        currentStepOrder: row.currentStepOrder,
        stepName: step.stepName,
        user: row.user,
      })
    }
  }
  return out
}

export async function getPendingOutsideForApprover(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<InboxOutsideItem[]> {
  const rows = await prisma.outsideWorkRequest.findMany({
    where: {
      status: { notIn: ['APPROVED', 'REJECTED'] },
    },
    include: {
      user: { select: { id: true, name: true, email: true, department: true, position: true, role: true } },
      stepLogs: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 150,
  })

  const out: InboxOutsideItem[] = []
  for (const row of rows) {
    if (row.chainConfigId) {
      const step = row.stepLogs.find(
        (s) => s.stepOrder === row.currentStepOrder && s.status === 'PENDING',
      )
      if (!step) continue
      if (!canUserActOnStep(step, userId, role)) continue
      if (!(await canApproverActOnRequester(prisma, userId, role, row.userId))) continue
      out.push({
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
        stepName: step.stepName,
        user: row.user,
      })
    }
  }
  return out
}

export type InboxWeeklyItem = {
  id: string
  weekStart: Date
  weekEnd: Date
  status: string
  isLate: boolean
  note: string | null
  stepName: string | null
  lawyer: { name: string; email: string }
  days: { dayOfWeek: number; place: string | null; purpose: string | null }[]
}

export async function getPendingWeeklyForApprover(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<InboxWeeklyItem[]> {
  const rows = await prisma.weeklyLawyerPlan.findMany({
    where: { status: { notIn: ['APPROVED', 'REJECTED'] } },
    include: {
      lawyer: { select: { id: true, name: true, email: true } },
      stepLogs: true,
      days: { select: { dayOfWeek: true, place: true, purpose: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 80,
  })

  const out: InboxWeeklyItem[] = []
  for (const row of rows) {
    if (!row.chainConfigId) continue
    const step = row.stepLogs.find(
      (s) => s.stepOrder === row.currentStepOrder && s.status === 'PENDING',
    )
    if (!step) continue
    const ceoOverride = role === 'CEO' || role === 'SUPER_ADMIN'
    if (!ceoOverride && !canUserActOnStep(step, userId, role)) continue
    if (!ceoOverride && !(await canApproverActOnRequester(prisma, userId, role, row.lawyerId))) continue
    out.push({
      id: row.id,
      weekStart: row.weekStart,
      weekEnd: row.weekEnd,
      status: row.status,
      isLate: row.isLate,
      note: row.note,
      stepName: step.stepName,
      lawyer: { name: row.lawyer.name, email: row.lawyer.email },
      days: row.days,
    })
  }
  return out
}

export type DocumentInboxItem = {
  id: string
  docType: string
  title: string
  docRef: string | null
  amount: number | null
  status: string
  priority: string
  currentStep: number
  totalSteps: number
  stepName: string | null
  requestedBy: { name: string; role: string }
  createdAt: Date
}

export type ExpenseInboxItem = {
  id: string
  title: string
  amount: number
  expenseType: string
  status: string
  stepLabel: string
  approveAction: 'supervisor_approve' | 'ceo_approve'
  date: Date
  submittedBy: { id: string; name: string; email: string; department: string | null; position: string | null }
}

export type ApproverInboxCounts = {
  leave: number
  outside: number
  weekly: number
  forgotScan: number
  documents: number
  expenses: number
  total: number
}

const EXPENSE_SUPERVISOR: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER', 'ADMIN']
const EXPENSE_CEO: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR']

function canSeeWeeklyInbox(role: Role): boolean {
  return role === 'CEO' || role === 'ADMIN' || hasPermission(role, 'approve_weekly_plan')
}

function canSeeForgotScanInbox(role: Role): boolean {
  return FORGOT_SCAN_SUPERVISOR.includes(role) || FORGOT_SCAN_HR.includes(role)
}

export async function getPendingForgotScanForApprover(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<InboxForgotScanItem[]> {
  if (!canSeeForgotScanInbox(role)) return []

  const rows = await prisma.forgotScanRequest.findMany({
    where: { status: { notIn: ['APPROVED', 'REJECTED', 'ADMIN_REJECTED'] } },
    include: {
      user: { select: { id: true, name: true, email: true, department: true, position: true, role: true } },
      stepLogs: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const out: InboxForgotScanItem[] = []
  for (const row of rows) {
    if (row.chainConfigId) {
      const step = row.stepLogs.find(
        (s) => s.stepOrder === row.currentStepOrder && s.status === 'PENDING',
      )
      if (!step) continue
      const ceoOverride = role === 'CEO' || role === 'SUPER_ADMIN'
      if (!ceoOverride && !canUserActOnStep(step, userId, role)) continue
      if (!ceoOverride && !(await canApproverActOnRequester(prisma, userId, role, row.userId))) continue
      out.push({
        id: row.id,
        date: row.date,
        scanType: row.scanType,
        correctTime: row.correctTime,
        reason: row.reason,
        status: row.status,
        stepName: step.stepName,
        user: row.user,
      })
    } else {
      const isSupervisor = FORGOT_SCAN_SUPERVISOR.includes(role)
      const isHR = FORGOT_SCAN_HR.includes(role)
      if (row.status === 'PENDING' && isSupervisor) {
        if (await canApproverActOnRequester(prisma, userId, role, row.userId)) {
          out.push({
            id: row.id,
            date: row.date,
            scanType: row.scanType,
            correctTime: row.correctTime,
            reason: row.reason,
            status: row.status,
            stepName: 'หัวหน้า (legacy)',
            user: row.user,
          })
        }
      } else if (row.status === 'ADMIN_APPROVED' && isHR) {
        out.push({
          id: row.id,
          date: row.date,
          scanType: row.scanType,
          correctTime: row.correctTime,
          reason: row.reason,
          status: row.status,
          stepName: 'HR (legacy)',
          user: row.user,
        })
      }
    }
  }
  return out
}

/** Short label for dashboard cards — e.g. "ลา 2 · นอก 1 · แผน 1" */
export function formatInboxSummary(counts: ApproverInboxCounts, role: Role): string {
  const parts: string[] = []
  if (counts.leave > 0) parts.push(`ลา ${counts.leave}`)
  if (counts.outside > 0 && hasPermission(role, 'approve_outside_work')) {
    parts.push(`นอก ${counts.outside}`)
  }
  if (counts.weekly > 0 && canSeeWeeklyInbox(role)) parts.push(`แผน ${counts.weekly}`)
  if (counts.forgotScan > 0 && canSeeForgotScanInbox(role)) parts.push(`แก้เวลา ${counts.forgotScan}`)
  if (counts.documents > 0) parts.push(`เอกสาร ${counts.documents}`)
  if (counts.expenses > 0) parts.push(`เบิก ${counts.expenses}`)
  return parts.length > 0 ? parts.join(' · ') : 'ไม่มีรายการค้าง'
}

export async function getPendingDocumentsForApprover(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<DocumentInboxItem[]> {
  const rows = await prisma.approvalRequest.findMany({
    where: {
      status: { notIn: ['APPROVED', 'REJECTED', 'CANCELLED'] },
      steps: {
        some: {
          status: 'PENDING',
          OR: [{ approverId: userId }, { approverRole: role }],
        },
      },
    },
    include: {
      requestedBy: { select: { name: true, role: true } },
      steps: { orderBy: { stepOrder: 'asc' } },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 50,
  })

  return rows.map((row) => {
    const active = row.steps.find((s) => s.stepOrder === row.currentStep && s.status === 'PENDING')
    return {
      id: row.id,
      docType: row.docType,
      title: row.title,
      docRef: row.docRef,
      amount: row.amount,
      status: row.status,
      priority: row.priority,
      currentStep: row.currentStep,
      totalSteps: row.totalSteps,
      stepName: active?.stepName ?? null,
      requestedBy: row.requestedBy,
      createdAt: row.createdAt,
    }
  })
}

export async function getPendingExpensesForApprover(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<ExpenseInboxItem[]> {
  const out: ExpenseInboxItem[] = []

  if (EXPENSE_SUPERVISOR.includes(role)) {
    const pending = await prisma.expenseClaim.findMany({
      where: { status: 'PENDING' },
      include: {
        submittedBy: {
          select: { id: true, name: true, email: true, department: true, position: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    for (const row of pending) {
      if (['MANAGER', 'TEAM_LEADER'].includes(role)) {
        const ok = await canApproverActOnRequester(prisma, userId, role, row.submittedById)
        if (!ok) continue
      }
      out.push({
        id: row.id,
        title: row.title,
        amount: row.amount,
        expenseType: row.expenseType,
        status: row.status,
        stepLabel: 'หัวหน้างาน',
        approveAction: 'supervisor_approve',
        date: row.date,
        submittedBy: row.submittedBy,
      })
    }
  }

  if (EXPENSE_CEO.includes(role)) {
    const ceoPending = await prisma.expenseClaim.findMany({
      where: { status: 'SUPERVISOR_APPROVED' },
      include: {
        submittedBy: {
          select: { id: true, name: true, email: true, department: true, position: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    for (const row of ceoPending) {
      out.push({
        id: row.id,
        title: row.title,
        amount: row.amount,
        expenseType: row.expenseType,
        status: row.status,
        stepLabel: 'CEO / ผู้บริหาร',
        approveAction: 'ceo_approve',
        date: row.date,
        submittedBy: row.submittedBy,
      })
    }
  }

  return out
}

/** Count items this user can act on in /approval-center (org-scoped for TL/MANAGER). */
export async function getApproverInboxCounts(
  prisma: PrismaClient,
  userId: string,
  role: Role,
): Promise<ApproverInboxCounts> {
  const [leaveRows, outsideRows, weeklyRows, forgotRows, documentRows, expenseRows] = await Promise.all([
    getPendingLeaveForApprover(prisma, userId, role),
    getPendingOutsideForApprover(prisma, userId, role),
    canSeeWeeklyInbox(role)
      ? getPendingWeeklyForApprover(prisma, userId, role)
      : Promise.resolve([]),
    getPendingForgotScanForApprover(prisma, userId, role),
    getPendingDocumentsForApprover(prisma, userId, role),
    getPendingExpensesForApprover(prisma, userId, role),
  ])
  const leave = leaveRows.length
  const outside = outsideRows.length
  const weekly = weeklyRows.length
  const forgotScan = forgotRows.length
  const documents = documentRows.length
  const expenses = expenseRows.length
  return {
    leave,
    outside,
    weekly,
    forgotScan,
    documents,
    expenses,
    total: leave + outside + weekly + forgotScan + documents + expenses,
  }
}
