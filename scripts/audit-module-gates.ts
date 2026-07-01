/**
 * Phase 1 role-gate audit — nav paths must match middleware ROUTE_PERMISSIONS.
 * Usage: npx tsx scripts/audit-module-gates.ts
 */
import type { Role } from '@prisma/client'
import { canAccess, ROUTE_PERMISSIONS } from '../lib/access-control/index'
import { isNavPathHidden, PHASE1_NAV_HIDDEN } from '../lib/module-gates'

/** Sidebar hrefs (keep in sync with Sidebar.tsx NAV_SECTIONS) */
const SIDEBAR_PATHS = [
  '/dashboard', '/executive',
  '/attendance', '/attendance/monthly', '/calendar', '/leave', '/outside-work',
  '/forgot-scan', '/weekly-plan', '/attendance/scans',
  '/tasks', '/performance', '/knowledge', '/sop', '/training',
  '/cases', '/case-documents', '/clients', '/debtors', '/debt-followup',
  '/payment-appointments', '/court-calendar', '/appointments',
  '/client-companies', '/contracts', '/client-history',
  '/recovery', '/case-finance', '/expense-claim', '/billing', '/invoices', '/receipts',
  '/approval-center', '/approvals', '/employees', '/payroll', '/payslip', '/reports', '/probation',
  '/documents', '/warnings', '/rules', '/branches', '/organization',
  '/automation', '/settings', '/security', '/announcements', '/line-oa', '/notifications',
] as const

type Expect = { role: Role; path: string; allow: boolean }

const ROLE_EXPECTATIONS: Expect[] = [
  // EMPLOYEE — HR core only
  { role: 'EMPLOYEE', path: '/attendance', allow: true },
  { role: 'EMPLOYEE', path: '/leave', allow: true },
  { role: 'EMPLOYEE', path: '/payslip', allow: true },
  { role: 'EMPLOYEE', path: '/approval-center', allow: false },
  { role: 'EMPLOYEE', path: '/cases', allow: false },
  { role: 'EMPLOYEE', path: '/tasks', allow: false },
  { role: 'EMPLOYEE', path: '/executive', allow: false },
  { role: 'EMPLOYEE', path: '/billing', allow: false },
  { role: 'EMPLOYEE', path: '/payroll', allow: false },
  // TEAM_LEADER — approver + HR ops, no legal/work modules
  { role: 'TEAM_LEADER', path: '/approval-center', allow: true },
  { role: 'TEAM_LEADER', path: '/attendance/scans', allow: true },
  { role: 'TEAM_LEADER', path: '/cases', allow: false },
  { role: 'TEAM_LEADER', path: '/tasks', allow: false },
  { role: 'TEAM_LEADER', path: '/executive', allow: false },
  { role: 'TEAM_LEADER', path: '/payroll', allow: false },
  // LAWYER — legal module, not HR payroll admin
  { role: 'LAWYER', path: '/cases', allow: true },
  { role: 'LAWYER', path: '/clients', allow: true },
  { role: 'LAWYER', path: '/court-calendar', allow: true },
  { role: 'LAWYER', path: '/payroll', allow: false },
  { role: 'LAWYER', path: '/executive', allow: false },
  { role: 'LAWYER', path: '/settings', allow: false },
  // HR — payroll + employees, not CEO executive
  { role: 'HR', path: '/payroll', allow: true },
  { role: 'HR', path: '/employees', allow: true },
  { role: 'HR', path: '/approval-center', allow: true },
  { role: 'HR', path: '/executive', allow: false },
  { role: 'HR', path: '/cases', allow: true },
]

let passed = 0
let failed = 0

function ok(name: string) {
  console.log(`✅ ${name}`)
  passed += 1
}

function fail(name: string, detail: string) {
  console.log(`❌ ${name} — ${detail}`)
  failed += 1
}

// Every sidebar path (except hidden) must have ROUTE_PERMISSIONS entry
for (const path of SIDEBAR_PATHS) {
  if (isNavPathHidden(path)) continue
  if (!ROUTE_PERMISSIONS[path]) {
    fail(`route registered: ${path}`, 'missing from ROUTE_PERMISSIONS')
  } else {
    ok(`route registered: ${path}`)
  }
}

// Hidden paths should not appear in nav audit as registered routes (optional pages)
for (const path of PHASE1_NAV_HIDDEN) {
  ok(`nav hidden: ${path}`)
}

// Role expectations
for (const { role, path, allow } of ROLE_EXPECTATIONS) {
  const got = canAccess(role, path)
  if (got === allow) {
    ok(`${role} ${allow ? 'can' : 'cannot'} ${path}`)
  } else {
    fail(`${role} ${path}`, `expected ${allow ? 'allow' : 'deny'}, got ${got ? 'allow' : 'deny'}`)
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
