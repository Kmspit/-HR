/** Shared between EmployeeProfileTab.tsx (self/HR edit) and the audit-diff
 *  display (lib/employee-audit.ts) so both read the same option list for
 *  EmployeeProfile.educationLevel — same reasoning/pattern as
 *  lib/marital-status.ts / lib/payment-method.ts.
 *
 *  Values are the exact strings of the Prisma `EducationLevel` enum — kept
 *  as plain string literals here (not imported from @prisma/client) since
 *  this module is also used by client components. Highest/latest level
 *  only — not a full education history (see plan approval 2026-09-22). */
export const EDUCATION_LEVEL_OPTIONS = [
  { value: 'PRIMARY', label: 'ประถมศึกษา' },
  { value: 'SECONDARY', label: 'มัธยมศึกษา' },
  { value: 'VOCATIONAL_CERT', label: 'ปวช.' },
  { value: 'VOCATIONAL_DIPLOMA', label: 'ปวส.' },
  { value: 'BACHELOR', label: 'ปริญญาตรี' },
  { value: 'MASTER', label: 'ปริญญาโท' },
  { value: 'DOCTORATE', label: 'ปริญญาเอก' },
  { value: 'OTHER', label: 'อื่นๆ' },
] as const

export type EducationLevelValue = (typeof EDUCATION_LEVEL_OPTIONS)[number]['value']

const VALID_VALUES = new Set<string>(EDUCATION_LEVEL_OPTIONS.map((o) => o.value))

export function isValidEducationLevel(value: string): value is EducationLevelValue {
  return VALID_VALUES.has(value)
}

export function educationLevelLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return EDUCATION_LEVEL_OPTIONS.find((o) => o.value === value)?.label ?? value
}
