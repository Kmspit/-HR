/** Shared between EmployeeProfileTab.tsx (self/HR edit) and the audit-diff
 *  display (lib/employee-audit.ts) so both read the same option list for
 *  EmployeeProfile.bloodType — same reasoning/pattern as
 *  lib/marital-status.ts / lib/payment-method.ts.
 *
 *  Values are the exact strings of the Prisma `BloodType` enum — kept as
 *  plain string literals here (not imported from @prisma/client) since this
 *  module is also used by client components. */
export const BLOOD_TYPE_OPTIONS = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'AB', label: 'AB' },
  { value: 'O', label: 'O' },
  { value: 'UNKNOWN', label: 'ไม่ทราบ' },
] as const

export type BloodTypeValue = (typeof BLOOD_TYPE_OPTIONS)[number]['value']

const VALID_VALUES = new Set<string>(BLOOD_TYPE_OPTIONS.map((o) => o.value))

export function isValidBloodType(value: string): value is BloodTypeValue {
  return VALID_VALUES.has(value)
}

export function bloodTypeLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return BLOOD_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value
}
