/**
 * Phase 4 — deploy profiles (single codebase, multiple Vercel deployments).
 *
 * Set on Vercel per project:
 *   NEXT_PUBLIC_DEPLOY_PROFILE=full|hr|legal   (default: full)
 *   NEXT_PUBLIC_FROZEN_MODULES=/automation   (Phase 2 — comma paths)
 */
export type DeployProfile = 'full' | 'hr' | 'legal'

export const LEGAL_PATHS = [
  '/cases', '/case-documents', '/clients', '/debtors', '/debt-followup',
  '/payment-appointments', '/court-calendar', '/appointments',
  '/client-companies', '/contracts', '/client-history', '/recovery',
] as const

export const FINANCE_PATHS = [
  '/case-finance', '/expense-claim', '/billing', '/invoices', '/receipts',
] as const

/** HR admin modules hidden on legal-only deploy */
export const HR_ADMIN_PATHS = [
  '/payroll', '/employees', '/probation', '/branches', '/organization',
  '/line-oa', '/automation', '/reports',
] as const

/** Work modules hidden on hr-only deploy */
export const WORK_MODULE_PATHS = [
  '/tasks', '/performance',
] as const

/** Extra paths hidden on legal-only deploy */
export const LEGAL_EXTRA_PATHS = [
  '/settings', '/executive', '/security', '/documents',
] as const

/** Always reachable when logged in — never hidden by profile or FROZEN_MODULES */
export const DEPLOY_PROFILE_ALWAYS_VISIBLE = [
  '/manual', '/dashboard', '/notifications', '/profile', '/unauthorized', '/org-pending',
] as const

function readProfile(): DeployProfile {
  const raw = (
    process.env.NEXT_PUBLIC_DEPLOY_PROFILE ??
    process.env.DEPLOY_PROFILE ??
    'full'
  ).toLowerCase()
  if (raw === 'hr' || raw === 'legal') return raw
  return 'full'
}

function readFrozenPaths(): Set<string> {
  const raw =
    process.env.NEXT_PUBLIC_FROZEN_MODULES ??
    process.env.FROZEN_MODULES ??
    ''
  const set = new Set<string>()
  for (const part of raw.split(',')) {
    const p = part.trim()
    if (p.startsWith('/')) set.add(p)
  }
  return set
}

let cachedProfile: DeployProfile | null = null
let cachedFrozen: Set<string> | null = null

export function getDeployProfile(): DeployProfile {
  if (cachedProfile === null) cachedProfile = readProfile()
  return cachedProfile
}

export function getFrozenPaths(): Set<string> {
  if (cachedFrozen === null) cachedFrozen = readFrozenPaths()
  return cachedFrozen
}

/** Reset caches (tests). */
export function resetDeployProfileCache(): void {
  cachedProfile = null
  cachedFrozen = null
}

function pathsHiddenByProfile(profile: DeployProfile): readonly string[] {
  if (profile === 'hr') return [...LEGAL_PATHS, ...FINANCE_PATHS, ...WORK_MODULE_PATHS]
  if (profile === 'legal') return [...HR_ADMIN_PATHS, ...LEGAL_EXTRA_PATHS]
  return []
}

/** Map page or /api/* pathname to profile check path (/api/foo → /foo). */
export function toDeployProfilePath(pathname: string): string {
  if (pathname.startsWith('/api/')) {
    const rest = pathname.slice(4)
    return rest.startsWith('/') ? rest : `/${rest}`
  }
  return pathname
}

export function isPathHiddenByDeployProfile(path: string): boolean {
  const profile = getDeployProfile()
  const normalized = toDeployProfilePath(path)
  for (const always of DEPLOY_PROFILE_ALWAYS_VISIBLE) {
    if (normalized === always || normalized.startsWith(`${always}/`)) return false
  }
  for (const prefix of pathsHiddenByProfile(profile)) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) return true
  }
  for (const frozen of getFrozenPaths()) {
    if (normalized === frozen || normalized.startsWith(`${frozen}/`)) return true
  }
  return false
}

export function getDeployProfileLabel(profile: DeployProfile = getDeployProfile()): string {
  switch (profile) {
    case 'hr': return 'HR-only'
    case 'legal': return 'Legal-only'
    default: return 'Full'
  }
}
