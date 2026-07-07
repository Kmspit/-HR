/** Map pathname → manual ?section= slug for ManualButton deep links. */
const PATH_SECTION: Record<string, string> = {
  '/leave': 'leave',
  '/outside-work/deleted': 'outside-work-deleted',
  '/outside-work': 'outside-work',
  '/attendance': 'attendance',
  '/weekly-plan': 'weekly-plan',
  '/forgot-scan': 'forgot-scan',
  '/payroll': 'payroll',
  '/profile': 'profile',
  '/announcements': 'announcements',
  '/payslip': 'payslip',
  '/approval-center': 'approval-center',
  '/employees': 'employees',
  '/reports': 'reports',
  '/settings': 'settings',
  '/calendar': 'calendar',
  '/warnings': 'warnings',
  '/line-oa': 'line-oa',
  '/tasks': 'tasks',
  '/cases': 'cases',
}

export function manualSectionFromPath(pathname: string): string | undefined {
  if (pathname === '/manual' || pathname.startsWith('/manual/')) return undefined

  const exact = PATH_SECTION[pathname]
  if (exact) return exact

  for (const [path, section] of Object.entries(PATH_SECTION)) {
    if (pathname.startsWith(`${path}/`)) return section
  }

  const seg = pathname.split('/').filter(Boolean)[0]
  return seg || undefined
}

/** Which manual tab owns a section slug. */
export const MANUAL_SECTION_TAB: Record<string, 'employee' | 'hr'> = {
  attendance: 'employee',
  leave: 'employee',
  'outside-work': 'employee',
  'weekly-plan': 'employee',
  'forgot-scan': 'employee',
  profile: 'employee',
  announcements: 'employee',
  payslip: 'employee',
  calendar: 'employee',
  tasks: 'employee',
  'approval-center': 'hr',
  payroll: 'hr',
  employees: 'hr',
  warnings: 'hr',
  reports: 'hr',
  settings: 'hr',
  cases: 'hr',
  'cases-court': 'hr',
  'cases-checklist': 'hr',
  'cases-debtor': 'hr',
  'cases-finance': 'hr',
  'cases-documents': 'hr',
  'outside-work-deleted': 'hr',
  'line-oa': 'hr',
}
