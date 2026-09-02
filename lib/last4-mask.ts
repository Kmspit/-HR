/**
 * Shows the last 4 digits, masks the rest — the convention Phase 1 step 8b
 * uses for Dependent.nationalIdLast4 and BankAccount.accountNumberLast4.
 * Deliberately NOT lib/national-id.ts's maskNationalId(), which shows only
 * the last 1 digit for the employee's OWN national ID (nationalIdPdfPassword
 * uses the last 4 as a PDF-unlock code — showing 4 there would leak it). A
 * dependent/bank-account's last4 is a separate, already-plaintext DB column
 * chosen specifically so the list view never needs to decrypt anything.
 */
export function formatLast4(last4: string | null | undefined): string {
  if (!last4) return 'ยังไม่ได้กรอก'
  return `${'•'.repeat(9)}${last4}`
}
