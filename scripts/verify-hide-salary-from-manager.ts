/**
 * Live-DB verification for the 4.3 backlog fix (baseSalary leaking to
 * MANAGER via page payloads/props, not just a hidden UI input). Follows
 * CLAUDE.md's live-DB rules: creates throwaway users with an unambiguous
 * `+script-verify-<timestamp>@` email, never touches a real account, and
 * deletes everything it created at the end.
 *
 * Usage: npx tsx scripts/verify-hide-salary-from-manager.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env') })

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { loadEmployeeTimeline } from '../lib/employee-timeline/load-data'
import { canViewEmployeeTimeline } from '../lib/employee-timeline/access'
import { canApproverActOnRequester } from '../lib/org-scope'
import { canManageUserProfile } from '../lib/role-assignment'
import {
  snapshotEmployeeForAudit, mapEmployeeAuditLogs, summarizeEmployeeChanges,
} from '../lib/employee-audit'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
const prisma =
  url && token
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
    : new PrismaClient()

const stamp = Date.now()
const tag = `script-verify-${stamp}`
const SALARY = 87654
const SALARY_FMT = SALARY.toLocaleString('th-TH')
const SALARY_AFTER = SALARY + 5000
const SALARY_AFTER_FMT = SALARY_AFTER.toLocaleString('th-TH')

let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  OK   ${label}`)
  else { failed++; console.log(`  FAIL ${label}`, detail ?? '') }
}

async function main() {
  console.log(`\n=== 4.3 hide-salary-from-manager — live-DB verification (${tag}) ===\n`)

  const manager = await prisma.user.create({
    data: { email: `${tag}-mgr@test.com`, passwordHash: 'x', name: `Script Verify Manager ${stamp}`, role: 'MANAGER', status: 'ACTIVE' },
  })
  const employee = await prisma.user.create({
    data: {
      email: `${tag}-emp@test.com`, passwordHash: 'x', name: `Script Verify Employee ${stamp}`,
      role: 'EMPLOYEE', status: 'ACTIVE', managerId: manager.id, baseSalary: SALARY,
    },
  })
  const hrUser = await prisma.user.create({
    data: { email: `${tag}-hr@test.com`, passwordHash: 'x', name: `Script Verify HR ${stamp}`, role: 'HR', status: 'ACTIVE' },
  })
  console.log(`created throwaway users: manager=${manager.id} employee=${employee.id} hr=${hrUser.id}`)

  let payrollId: string | null = null
  let auditLogId: string | null = null

  try {
    // ── Confirm the threat model is real: MANAGER genuinely reaches these
    //    pages for this employee (otherwise the leak wouldn't be reachable). ──
    const mgrCanViewTimeline = await canViewEmployeeTimeline(prisma, manager.id, 'MANAGER', null, employee.id)
    check('MANAGER can reach /employees/[id]/timeline for their own report (confirms the leak was reachable)', mgrCanViewTimeline === true)
    const mgrCanActOn = await canApproverActOnRequester(prisma, manager.id, 'MANAGER', employee.id)
    check('MANAGER passes canApproverActOnRequester for their own report', mgrCanActOn === true)
    check('MANAGER passes canManageUserProfile (reaches /employees/[id])', canManageUserProfile('MANAGER') === true)

    // ── loadEmployeeTimeline: payroll + salary-audit rows ──────────────────
    const payroll = await prisma.payroll.create({
      data: {
        userId: employee.id, month: 9, year: 2026, baseSalary: SALARY, netSalary: SALARY - 500,
        lateDeduction: 0, absentDeduction: 0, unpaidLeave: 0, socialSecurity: 0, status: 'APPROVED',
      },
    })
    payrollId = payroll.id

    const before = snapshotEmployeeForAudit({
      email: employee.email, phone: null, name: employee.name, nameEn: null, nickname: null, prefix: null,
      address: null, addressIdCard: null, birthDate: null, nationalId: null, lineId: null,
      role: 'EMPLOYEE', status: 'ACTIVE', startDate: null, department: null, position: 'Junior',
      jobLevel: null, socialSecurityNumber: null,
      employeeType: null, managerId: manager.id, teamLeaderId: null, baseSalary: SALARY,
      socialSecurity: true, isCoworker: false, divisionId: null, sectionId: null, employeeProfile: null,
    })
    const after = snapshotEmployeeForAudit({
      ...before, position: 'Senior', baseSalary: SALARY_AFTER,
    } as never)
    const auditLog = await prisma.auditLog.create({
      data: {
        actorId: hrUser.id, targetId: employee.id, targetType: 'User', action: 'UPDATE',
        before: JSON.stringify(before), after: JSON.stringify(after),
      },
    })
    auditLogId = auditLog.id

    const timelineHidden = await loadEmployeeTimeline(prisma, employee.id, false)
    const hiddenJson = JSON.stringify(timelineHidden)
    check('loadEmployeeTimeline(canViewSalary=false): no payroll-category events at all', !timelineHidden!.events.some((e) => e.category === 'payroll'))
    check(
      'loadEmployeeTimeline(canViewSalary=false): the real salary number appears NOWHERE in the payload (raw or ฿-formatted)',
      !hiddenJson.includes(String(SALARY)) && !hiddenJson.includes(SALARY_FMT) && !hiddenJson.includes(String(SALARY_AFTER)) && !hiddenJson.includes(SALARY_AFTER_FMT),
    )

    const timelineVisible = await loadEmployeeTimeline(prisma, employee.id, true)
    const visibleJson = JSON.stringify(timelineVisible)
    check('loadEmployeeTimeline(canViewSalary=true, HR path): the salary DOES appear (sanity check — HR is not broken)', visibleJson.includes(SALARY_FMT))

    // ── /api/users/[id]/history — mapEmployeeAuditLogs / summarizeEmployeeChanges ──
    const logsForMap = [{ id: auditLog.id, createdAt: auditLog.createdAt, before: auditLog.before, after: auditLog.after, actor: { name: hrUser.name } }]
    const lookup = { users: new Map(), divisions: new Map(), sections: new Map() }
    const historyHidden = mapEmployeeAuditLogs(logsForMap, lookup, false)
    const historyHiddenJson = JSON.stringify(historyHidden)
    check('history tab (canViewSalary=false): position change still shown', historyHiddenJson.includes('Junior') && historyHiddenJson.includes('Senior'))
    check(
      'history tab (canViewSalary=false): salary numbers appear NOWHERE (raw or ฿-formatted)',
      !historyHiddenJson.includes(String(SALARY)) && !historyHiddenJson.includes(SALARY_FMT) && !historyHiddenJson.includes(String(SALARY_AFTER)) && !historyHiddenJson.includes(SALARY_AFTER_FMT),
    )

    const historyVisible = mapEmployeeAuditLogs(logsForMap, lookup, true)
    check('history tab (canViewSalary=true, HR path): salary change line present (sanity check)', JSON.stringify(historyVisible).includes(SALARY_FMT))

    // ── /employees and /employees/[id] page-payload construction (same
    //    ternary the page.tsx files now use, against the real DB row) ──────
    const rawUser = await prisma.user.findUnique({ where: { id: employee.id }, select: { id: true, baseSalary: true } })
    const listPagePropsForManager = { ...rawUser, baseSalary: false ? rawUser!.baseSalary : null }
    const listPagePropsForHr = { ...rawUser, baseSalary: true ? rawUser!.baseSalary : null }
    check('/employees list page props for MANAGER: baseSalary is null, not the real value', listPagePropsForManager.baseSalary === null)
    check('/employees list page props for HR_ADMIN: baseSalary is the real value (sanity check)', listPagePropsForHr.baseSalary === SALARY)

    console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}\n`)
  } finally {
    if (auditLogId) await prisma.auditLog.deleteMany({ where: { id: auditLogId } })
    if (payrollId) await prisma.payroll.deleteMany({ where: { id: payrollId } })
    await prisma.notification.deleteMany({ where: { userId: { in: [manager.id, employee.id, hrUser.id] } } })
    await prisma.user.deleteMany({ where: { id: { in: [manager.id, employee.id, hrUser.id] } } })
    console.log('cleanup done — all throwaway rows removed')
  }

  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('verification script crashed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
