import type { RegisterAddress } from '@/lib/register-form-validation'

/**
 * Renders a structured address (EmployeeProfile's 8 sub-fields) as a single
 * display string — used to keep User.address / User.addressIdCard (the
 * legacy free-text cache columns, still read directly by the employee edit
 * page, self-profile page, and both audit-snapshot systems per Phase 1
 * step 1's grep sweep) populated for new registrants, so those existing
 * surfaces don't go blank just because the real data now lives structured
 * in EmployeeProfile instead. Purely a display concatenation — the
 * structured fields remain the source of truth.
 */
export function formatThaiAddress(address: RegisterAddress): string {
  const parts: string[] = []
  if (address.houseNo.trim()) parts.push(address.houseNo.trim())
  if (address.moo.trim()) parts.push(`หมู่ ${address.moo.trim()}`)
  if (address.soi.trim()) parts.push(`ซอย ${address.soi.trim()}`)
  if (address.road.trim()) parts.push(`ถนน ${address.road.trim()}`)
  if (address.tambon.trim()) parts.push(`ต.${address.tambon.trim()}`)
  if (address.amphoe.trim()) parts.push(`อ.${address.amphoe.trim()}`)
  if (address.province.trim()) parts.push(`จ.${address.province.trim()}`)
  if (address.postalCode.trim()) parts.push(address.postalCode.trim())
  return parts.join(' ')
}
