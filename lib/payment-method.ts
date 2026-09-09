/** Shared between the registration wizard (RegisterForm.tsx) and the
 *  self/HR "ข้อมูลส่วนตัวเพิ่มเติม" tab (EmployeeProfileTab.tsx) so the two
 *  forms can never drift into offering different option lists for the same
 *  EmployeeProfile.paymentMethod column — same reasoning as
 *  lib/marital-status.ts's MARITAL_STATUS_OPTIONS.
 *
 *  Values are the exact strings of the Prisma `PaymentMethod` enum — kept as
 *  plain string literals here (not imported from @prisma/client) since this
 *  module is also used by client components. */
export const PAYMENT_METHOD_OPTIONS = [
  { value: 'BANK_TRANSFER', label: 'โอนเข้าบัญชี' },
  { value: 'CASH', label: 'เงินสด' },
  { value: 'CHEQUE', label: 'เช็ค' },
] as const

export type PaymentMethodValue = (typeof PAYMENT_METHOD_OPTIONS)[number]['value']

const VALID_VALUES = new Set<string>(PAYMENT_METHOD_OPTIONS.map((o) => o.value))

export function isValidPaymentMethod(value: string): value is PaymentMethodValue {
  return VALID_VALUES.has(value)
}

export function paymentMethodLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label ?? value
}
