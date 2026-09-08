/**
 * Shows the last 4 digits, masks the rest — the convention Phase 1 step 8b
 * uses for Dependent.nationalIdLast4 and BankAccount.accountNumberLast4.
 * Deliberately NOT lib/national-id.ts's maskNationalId() — both now reveal
 * 4 digits, but for different reasons and off different data. This one's
 * input is a separate, already-plaintext DB column (last4) chosen so list
 * views never need to decrypt anything; maskNationalId() masks the live
 * nationalId field itself (a candidate for encryption-at-rest — see the
 * nationalId-encryption backlog item), so it stays a display-time slice of
 * the real value rather than a stored column of its own.
 */
export function formatLast4(last4: string | null | undefined): string {
  if (!last4) return 'ยังไม่ได้กรอก'
  return `${'•'.repeat(9)}${last4}`
}
