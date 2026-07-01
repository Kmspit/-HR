/** Prototype HTML under /prototype/* — auth + deploy-profile mapping */

export const PUBLIC_PROTOTYPE_PATHS = new Set([
  '/prototype/login.html',
  '/prototype/forgot-password.html',
  '/prototype/index.html',
])

/** Map prototype filename (without .html) → app route for deploy-profile checks */
const PROTOTYPE_FILE_TO_APP: Record<string, string> = {
  payroll: '/payroll',
  employees: '/employees',
  settings: '/settings',
  reports: '/reports',
  probation: '/probation',
  'line-oa': '/line-oa',
  executive: '/executive',
  automation: '/automation',
}

export function isPublicPrototypePath(pathname: string): boolean {
  return PUBLIC_PROTOTYPE_PATHS.has(pathname)
}

/** App route to check deploy profile, or null if generic prototype page */
export function prototypeDeployCheckPath(pathname: string): string | null {
  const m = pathname.match(/^\/prototype\/([a-z0-9-]+)\.html$/i)
  if (!m) return pathname.startsWith('/prototype/') ? '/prototype' : null
  return PROTOTYPE_FILE_TO_APP[m[1].toLowerCase()] ?? null
}

export function isPrototypeHtmlPath(pathname: string): boolean {
  return pathname.startsWith('/prototype/')
}
