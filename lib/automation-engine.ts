/**
 * Automation Engine — Phase 13
 * Central rule evaluation + action execution for all system triggers.
 */

import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// ─── Trigger catalogue ────────────────────────────────────────────────────────

export type TriggerType =
  | 'CASE_CREATED'       | 'CASE_UPDATED'
  | 'COURT_CREATED'      | 'COURT_MISSED'
  | 'TASK_OVERDUE'       | 'TASK_COMPLETED'
  | 'PROMISE_CREATED'    | 'PROMISE_BROKEN'
  | 'PAYMENT_CONFIRMED'  | 'PAYMENT_LARGE'
  | 'DOCUMENT_UPLOADED'
  | 'EMPLOYEE_LATE'      | 'WARNING_CREATED'
  | 'LEAVE_REQUESTED'    | 'APPROVAL_PENDING'

// ─── Condition types ──────────────────────────────────────────────────────────

type ConditionOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'contains' | 'in' | 'exists'

export type Condition = {
  field: string
  operator: ConditionOperator
  value: unknown
}

// ─── Action types ─────────────────────────────────────────────────────────────

export type ActionType =
  | 'SEND_NOTIFICATION'
  | 'SEND_LINE'
  | 'ESCALATE_TO_MANAGER'
  | 'ESCALATE_TO_CEO'
  | 'CREATE_TASK'
  | 'CHANGE_RISK_LEVEL'
  | 'UPDATE_CASE_STATUS'
  | 'ASSIGN_USER'
  | 'CREATE_REMINDER'
  | 'CREATE_FOLLOWUP'

export type AutomationAction = {
  type: ActionType
  params: Record<string, unknown>
}

// ─── Condition evaluator ──────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

function evaluateCondition(data: Record<string, unknown>, cond: Condition): boolean {
  const actual = getNestedValue(data, cond.field)
  const expected = cond.value

  switch (cond.operator) {
    case 'gt':       return typeof actual === 'number' && actual > (expected as number)
    case 'gte':      return typeof actual === 'number' && actual >= (expected as number)
    case 'lt':       return typeof actual === 'number' && actual < (expected as number)
    case 'lte':      return typeof actual === 'number' && actual <= (expected as number)
    case 'eq':       return actual == expected // intentional loose equality for string/number
    case 'neq':      return actual != expected
    case 'contains': return typeof actual === 'string' && actual.toLowerCase().includes(String(expected).toLowerCase())
    case 'in':       return Array.isArray(expected) && expected.includes(actual)
    case 'exists':   return actual !== undefined && actual !== null
    default:         return false
  }
}

export function evaluateConditions(data: Record<string, unknown>, conditions: Condition[]): boolean {
  if (conditions.length === 0) return true
  return conditions.every(c => evaluateCondition(data, c))
}

// ─── Action executor ─────────────────────────────────────────────────────────

async function executeAction(
  action: AutomationAction,
  data: Record<string, unknown>,
  performedById: string,
): Promise<{ type: string; success: boolean; detail?: string }> {
  const p = action.params

  try {
    switch (action.type) {
      case 'SEND_NOTIFICATION': {
        const roles: string[] = Array.isArray(p.roles) ? (p.roles as string[]) : []
        const title   = interpolate(String(p.title ?? 'แจ้งเตือนอัตโนมัติ'), data)
        const message = interpolate(String(p.message ?? ''), data)
        const link    = String(p.link ?? '/dashboard')

        if (roles.length > 0) {
          const users = await prisma.user.findMany({
            where: { role: { in: roles as never[] }, status: 'ACTIVE' },
            select: { id: true },
          })
          if (users.length) {
            await prisma.notification.createMany({
              data: users.map(u => ({ userId: u.id, type: 'SYSTEM' as const, title, message, link })),
            })
          }
        } else if (p.userId) {
          await prisma.notification.create({
            data: { userId: String(p.userId), type: 'SYSTEM', title, message, link },
          })
        }
        return { type: action.type, success: true, detail: `Notified ${roles.join(',')}` }
      }

      case 'SEND_LINE': {
        const message = interpolate(String(p.message ?? ''), data)
        const { sendLineNotify } = await import('@/lib/notifications')
        await sendLineNotify(message)
        return { type: action.type, success: true }
      }

      case 'ESCALATE_TO_MANAGER': {
        const title   = interpolate(String(p.title ?? '🚨 ต้องการการตรวจสอบ'), data)
        const message = interpolate(String(p.message ?? ''), data)
        const managers = await prisma.user.findMany({
          where: { role: { in: ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'MANAGER'] }, status: 'ACTIVE' },
          select: { id: true },
        })
        if (managers.length) {
          await prisma.notification.createMany({
            data: managers.map(u => ({ userId: u.id, type: 'SYSTEM' as const, title, message, link: String(p.link ?? '/dashboard') })),
          })
        }
        return { type: action.type, success: true, detail: `${managers.length} managers notified` }
      }

      case 'ESCALATE_TO_CEO': {
        const title   = interpolate(String(p.title ?? '🚨 CEO Alert'), data)
        const message = interpolate(String(p.message ?? ''), data)
        const ceos = await prisma.user.findMany({
          where: { role: { in: ['SUPER_ADMIN', 'CEO'] }, status: 'ACTIVE' },
          select: { id: true },
        })
        if (ceos.length) {
          await prisma.notification.createMany({
            data: ceos.map(u => ({ userId: u.id, type: 'SYSTEM' as const, title, message, link: String(p.link ?? '/dashboard') })),
          })
        }
        return { type: action.type, success: true }
      }

      case 'CREATE_TASK': {
        const assigneeId = String(p.assigneeId ?? data.assignedToId ?? data.collectorId ?? performedById ?? '')
        if (!assigneeId) return { type: action.type, success: false, detail: 'No assigneeId' }
        const dueDate = p.dueDaysFromNow
          ? new Date(Date.now() + Number(p.dueDaysFromNow) * 24 * 60 * 60 * 1000)
          : undefined
        await prisma.taskAssignment.create({
          data: {
            title:        interpolate(String(p.title ?? 'งานอัตโนมัติ'), data),
            description:  p.description ? interpolate(String(p.description), data) : null,
            assigneeId,
            assignedById: performedById,
            priority:     (['LOW','MEDIUM','HIGH'].includes(String(p.priority ?? 'MEDIUM')) ? String(p.priority ?? 'MEDIUM') : 'MEDIUM') as 'LOW'|'MEDIUM'|'HIGH',
            dueDate:      dueDate ?? null,
            status:       'PENDING',
            clientCompanyId: data.clientId ? String(data.clientId) : null,
            caseId:       data.caseId ? String(data.caseId) : null,
          },
        })
        return { type: action.type, success: true, detail: `Task created for ${assigneeId}` }
      }

      case 'CHANGE_RISK_LEVEL': {
        const debtorId = String(data.debtorId ?? '')
        if (!debtorId) return { type: action.type, success: false, detail: 'No debtorId' }
        await prisma.debtor.update({
          where: { id: debtorId },
          data: { riskLevel: String(p.riskLevel ?? 'HIGH') },
        })
        return { type: action.type, success: true }
      }

      case 'UPDATE_CASE_STATUS': {
        const caseId = String(data.caseId ?? '')
        if (!caseId) return { type: action.type, success: false, detail: 'No caseId' }
        await prisma.case.update({
          where: { id: caseId },
          data:  { status: String(p.status) as never },
        })
        return { type: action.type, success: true }
      }

      case 'ASSIGN_USER': {
        const userId   = String(p.userId ?? '')
        const debtorId = String(data.debtorId ?? '')
        const caseId   = String(data.caseId ?? '')
        if (debtorId) await prisma.debtor.update({ where: { id: debtorId }, data: { assignedToId: userId } })
        if (caseId)   await prisma.case.update({ where: { id: caseId }, data: { assignedEmployeeId: userId } })
        return { type: action.type, success: true }
      }

      case 'CREATE_REMINDER': {
        const userId  = String(p.userId ?? data.collectorId ?? data.assignedToId ?? performedById)
        const title   = interpolate(String(p.title ?? '⏰ แจ้งเตือน'), data)
        const message = interpolate(String(p.message ?? ''), data)
        await prisma.notification.create({
          data: { userId, type: 'SYSTEM', title, message, link: String(p.link ?? '/dashboard') },
        })
        return { type: action.type, success: true }
      }

      case 'CREATE_FOLLOWUP': {
        const debtorId = String(data.debtorId ?? '')
        if (!debtorId) return { type: action.type, success: false, detail: 'No debtorId' }
        await prisma.debtorContact.create({
          data: {
            id:          randomUUID(),
            debtorId,
            channel:     String(p.channel ?? 'PHONE'),
            direction:   'OUTBOUND',
            result:      'LEFT_MESSAGE',
            note:        interpolate(String(p.note ?? 'ติดตามอัตโนมัติจากระบบ'), data),
            performedById: performedById,
          },
        })
        return { type: action.type, success: true }
      }

      default:
        return { type: action.type, success: false, detail: `Unknown action type` }
    }
  } catch (err) {
    return { type: action.type, success: false, detail: String(err instanceof Error ? err.message : err) }
  }
}

// ─── Template interpolation ───────────────────────────────────────────────────

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
    const val = getNestedValue(data, key)
    return val != null ? String(val) : ''
  })
}

// ─── Main trigger function ────────────────────────────────────────────────────

export async function triggerAutomation(
  trigger: TriggerType,
  data: Record<string, unknown>,
  performedById: string = 'system',
): Promise<void> {
  const start = Date.now()

  let rules: { id: string; name: string; conditions: string; actions: string; testMode: boolean; priority: number }[] = []

  try {
    rules = await prisma.automationRule.findMany({
      where: { trigger, isActive: true },
      select: { id: true, name: true, conditions: true, actions: true, testMode: true, priority: true },
      orderBy: { priority: 'desc' },
    })
  } catch {
    return // DB not ready — fail silently
  }

  for (const rule of rules) {
    const ruleStart = Date.now()
    const actionsRun: { type: string; success: boolean; detail?: string }[] = []
    let success = true
    let errorMessage: string | undefined

    try {
      const conditions: Condition[] = JSON.parse(rule.conditions || '[]')
      const actions: AutomationAction[] = JSON.parse(rule.actions || '[]')

      if (!evaluateConditions(data, conditions)) continue

      for (const action of actions) {
        if (rule.testMode) {
          actionsRun.push({ type: action.type, success: true, detail: '[TEST MODE — not executed]' })
          continue
        }
        const result = await executeAction(action, data, performedById)
        actionsRun.push(result)
        if (!result.success) success = false
      }
    } catch (err) {
      success = false
      errorMessage = String(err instanceof Error ? err.message : err)
    }

    const durationMs = Date.now() - ruleStart

    // Log + update stats (fire-and-forget style — don't throw)
    try {
      await prisma.$transaction([
        prisma.automationExecutionLog.create({
          data: {
            id:          randomUUID(),
            ruleId:      rule.id,
            trigger,
            triggerData: JSON.stringify(data),
            success,
            actionsRun:  JSON.stringify(actionsRun),
            errorMessage: errorMessage ?? null,
            durationMs,
            testMode:    rule.testMode,
          },
        }),
        prisma.automationRule.update({
          where: { id: rule.id },
          data: {
            lastRunAt:    new Date(),
            runCount:     { increment: 1 },
            successCount: success ? { increment: 1 } : undefined,
            failCount:    success ? undefined : { increment: 1 },
          },
        }),
      ])
    } catch {
      // Logging failure should not break the caller
    }
  }
}
