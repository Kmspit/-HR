/**

 * Phase 1 role-gate audit — nav paths, deploy profile, API auth, permission matrix.

 * Usage: npx tsx scripts/audit-module-gates.ts

 */

import fs from 'node:fs'

import path from 'node:path'

import type { Role } from '@prisma/client'

import {

  canAccess,

  ROUTE_PERMISSIONS,

  ALL_PERMISSIONS,

  ROLE_PERMISSIONS,

} from '../lib/access-control/index'

import { matchRoutePermission } from '../lib/route-match'

import { isNavPathHidden, PHASE1_NAV_HIDDEN } from '../lib/module-gates'

import {

  LEGAL_PATHS,

  FINANCE_PATHS,

  HR_ADMIN_PATHS,

  WORK_MODULE_PATHS,

  LEGAL_EXTRA_PATHS,

  isPathHiddenByDeployProfile,

  resetDeployProfileCache,

} from '../lib/deploy-profile'

import { isPublicApiRoute } from '../lib/api-public-routes'

import { isApiDeployProfileExempt } from '../lib/middleware-config'



const SIDEBAR_PATHS = [

  '/dashboard', '/executive',

  '/attendance', '/attendance/monthly', '/calendar', '/leave', '/outside-work',

  '/forgot-scan', '/weekly-plan', '/attendance/scans',

  '/tasks', '/performance', '/sop',

  '/cases', '/case-documents', '/clients', '/debtors', '/debt-followup',

  '/payment-appointments', '/court-calendar', '/appointments',

  '/client-companies', '/contracts', '/client-history',

  '/recovery', '/case-finance', '/expense-claim', '/billing', '/invoices', '/receipts',

  '/approval-center', '/employees', '/payroll', '/payslip', '/reports', '/probation',

  '/documents', '/warnings', '/rules', '/branches', '/organization',

  '/automation', '/settings', '/security', '/announcements', '/line-oa', '/notifications',

] as const



const ALL_ROLES: Role[] = [

  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER',

  'EMPLOYEE', 'LAWYER', 'ENFORCEMENT', 'CLIENT',

]



const ROLE_EXPECTATIONS = [

  { role: 'EMPLOYEE' as Role, path: '/attendance', allow: true },

  { role: 'EMPLOYEE' as Role, path: '/approval-center', allow: false },

  { role: 'EMPLOYEE' as Role, path: '/payroll', allow: false },

  { role: 'TEAM_LEADER' as Role, path: '/approval-center', allow: true },

  { role: 'HR' as Role, path: '/payroll', allow: true },

  { role: 'LAWYER' as Role, path: '/cases', allow: true },

  { role: 'LAWYER' as Role, path: '/payroll', allow: false },

]



const API_AUTH_EXEMPT = new Set([

  '/api/leave/prototype',

  '/api/security/2fa/request-otp',

  '/api/security/2fa/verify',

])



const AUTH_PATTERNS = [

  /\bauth\s*\(/,

  /\brequireAuth\s*\(/,

  /\brequirePermission\s*\(/,

  /\brequireRoles\s*\(/,

  /\brequireOrgScope\s*\(/,

  /\brejectUnauthorizedCron\s*\(/,

  /\bcronRequestAuthorized\s*\(/,

  /\brequirePortalSession\s*\(/,

  /\bgetPortalSession\s*\(/,

]



let passed = 0

let failed = 0



function ok(name: string) { console.log(`✅ ${name}`); passed += 1 }

function fail(name: string, detail: string) { console.log(`❌ ${name} — ${detail}`); failed += 1 }



function collectApiRoutes(dir: string, base = ''): string[] {

  const out: string[] = []

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {

    const rel = `${base}/${entry.name}`.replace(/\\/g, '/')

    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) out.push(...collectApiRoutes(full, rel))

    else if (entry.name === 'route.ts') out.push(`/api${rel.replace(/\/route\.ts$/, '')}`)

  }

  return out

}



for (const p of SIDEBAR_PATHS) {

  if (isNavPathHidden(p)) continue

  if (!ROUTE_PERMISSIONS[p]) fail(`route registered: ${p}`, 'missing from ROUTE_PERMISSIONS')

  else ok(`route registered: ${p}`)

}



for (const { role, path: p, allow } of ROLE_EXPECTATIONS) {

  const got = canAccess(role, p)

  if (got === allow) ok(`${role} ${allow ? 'can' : 'cannot'} ${p}`)

  else fail(`${role} ${p}`, `expected ${allow ? 'allow' : 'deny'}, got ${got ? 'allow' : 'deny'}`)

}



{

  const scanRoute = matchRoutePermission('/attendance/scans')

  if (scanRoute === '/attendance/scans') ok('longest-prefix: /attendance/scans')

  else fail('longest-prefix: /attendance/scans', `matched ${scanRoute ?? 'none'}`)

}



for (const role of ALL_ROLES) {

  const perms = ROLE_PERMISSIONS[role]

  if (!Array.isArray(perms)) { fail(`permission matrix: ${role}`, 'missing entry'); continue }

  for (const perm of perms) {

    if (!ALL_PERMISSIONS.includes(perm)) fail(`permission matrix: ${role}`, `unknown ${perm}`)

  }

  ok(`permission matrix: ${role} (${perms.length} perms)`)

}



process.env.NEXT_PUBLIC_DEPLOY_PROFILE = 'hr'

resetDeployProfileCache()

for (const p of [...LEGAL_PATHS.slice(0, 3), ...FINANCE_PATHS.slice(0, 2), ...WORK_MODULE_PATHS.slice(0, 2)]) {

  if (isPathHiddenByDeployProfile(p) && isPathHiddenByDeployProfile(`/api${p}`)) ok(`deploy hr hides ${p}`)

  else fail(`deploy hr hides ${p}`, 'expected hidden')

}

if (!isPathHiddenByDeployProfile('/payroll')) ok('deploy hr allows /payroll')

else fail('deploy hr allows /payroll', 'should be visible')



process.env.NEXT_PUBLIC_DEPLOY_PROFILE = 'legal'

resetDeployProfileCache()

for (const p of [...HR_ADMIN_PATHS.slice(0, 3), ...LEGAL_EXTRA_PATHS.slice(0, 2)]) {

  if (isPathHiddenByDeployProfile(p)) ok(`deploy legal hides ${p}`)

  else fail(`deploy legal hides ${p}`, 'expected hidden')

}

delete process.env.NEXT_PUBLIC_DEPLOY_PROFILE

resetDeployProfileCache()



const apiRoot = path.join(process.cwd(), 'app', 'api')

const apiRoutes = collectApiRoutes(apiRoot)

const unguarded: string[] = []



for (const routePath of apiRoutes) {

  if (isPublicApiRoute(routePath) || isApiDeployProfileExempt(routePath) || API_AUTH_EXEMPT.has(routePath)) continue

  const filePath = path.join(apiRoot, routePath.replace(/^\/api\//, '').split('/').join(path.sep), 'route.ts')

  if (!fs.existsSync(filePath)) continue

  const src = fs.readFileSync(filePath, 'utf8')

  if (!AUTH_PATTERNS.some((re) => re.test(src))) unguarded.push(routePath)

}



if (unguarded.length === 0) ok(`API auth guards: ${apiRoutes.length} routes checked`)

else fail('API auth guards', `missing: ${unguarded.slice(0, 8).join(', ')}`)



console.log(`\n${passed} passed, ${failed} failed`)

process.exit(failed > 0 ? 1 : 0)

