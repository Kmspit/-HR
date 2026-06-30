/**
 * Phase 1 — module visibility gates (nav + middleware).
 * Hide/freeze modules by role without deleting code. Tune here during Phase 2.
 */
import type { Role } from '@prisma/client'

/** All internal staff (not CLIENT portal). */
export const CORE_STAFF: Role[] = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER',
  'EMPLOYEE', 'LAWYER', 'ENFORCEMENT',
]

export const EXEC_ONLY: Role[] = ['SUPER_ADMIN', 'CEO']
export const HR_ADMIN: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
export const HR_CORE: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']
export const MGR_UP: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']
export const APPR_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
export const EMPLOYEE_MGMT: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']
export const WEEKLY_PLAN: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'LAWYER', 'MANAGER', 'TEAM_LEADER']
export const SCAN_HISTORY: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

/** คดี & บังคับคดี — ไม่รวม TEAM_LEADER / EMPLOYEE */
export const LEGAL_MODULE: Role[] = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER', 'ENFORCEMENT',
]

/** ลูกค้า/สัญญา — legal + management */
export const CLIENT_MGMT: Role[] = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER',
]

/** บilling / invoice — finance admin */
export const FINANCE_MODULE: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

/** งาน/KPI/Training — managers + law (Phase 1: ซ่อนจาก TL/Employee) */
export const WORK_MODULE: Role[] = [
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'LAWYER',
]

/** Nav paths hidden in Phase 1 (no page or not ready). */
export const PHASE1_NAV_HIDDEN = new Set<string>(['/ai-assistant'])

export function canAccessModule(role: Role, allowed: Role[]): boolean {
  return allowed.includes(role)
}

export function isNavPathHidden(href: string): boolean {
  return PHASE1_NAV_HIDDEN.has(href)
}
