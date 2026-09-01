/**
 * localStorage autosave for the registration wizard. Kept as plain
 * functions (no React) — read/write/clear are each independently testable
 * against a fake storage object, same reasoning as every other pure-logic
 * module in this codebase.
 *
 * Never persists password/confirmPassword — storing a plaintext password in
 * localStorage (survives across tabs/reloads, readable by any script on the
 * origin) is a real credential-exposure risk this form doesn't need to take;
 * the user just re-types it if they come back to a resumed draft.
 */

export const REGISTER_DRAFT_STORAGE_KEY = 'hrflow_register_draft_v1'

export type RegisterEmergencyContactDraft = {
  name: string
  relationship: string
  phone: string
  altPhone: string
}

export type RegisterDependentDraft = {
  name: string
  relationType: string
  birthDate: string
  nationalId: string
  isTaxAllowance: boolean
}

export type RegisterBankAccountDraft = {
  bankCode: string
  accountNumber: string
  accountName: string
  accountType: string
  isPrimary: boolean
}

export type RegisterFormDraftFields = {
  step: number
  prefix: string
  firstName: string
  lastName: string
  nickname: string
  email: string
  phone: string
  lineId: string
  birthDate: string
  nationalId: string
  nationality: string
  maritalStatus: string
  role: string
  branchId: string
  socialSecurity: boolean
  currentHouseNo: string
  currentMoo: string
  currentSoi: string
  currentRoad: string
  currentTambon: string
  currentAmphoe: string
  currentProvince: string
  currentPostalCode: string
  sameAsCurrentAddress: boolean
  regHouseNo: string
  regMoo: string
  regSoi: string
  regRoad: string
  regTambon: string
  regAmphoe: string
  regProvince: string
  regPostalCode: string
  emergencyContacts: RegisterEmergencyContactDraft[]
  dependents: RegisterDependentDraft[]
  bankAccounts: RegisterBankAccountDraft[]
}

/** Minimal storage shape this module actually needs — lets tests pass a
 *  plain in-memory object instead of depending on a real `Storage`/jsdom. */
export type DraftStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function saveRegisterDraft(draft: RegisterFormDraftFields, storage: DraftStorage): void {
  try {
    storage.setItem(REGISTER_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Storage can throw (quota exceeded, private-browsing lockout) — losing
    // autosave is not worth breaking the form over.
  }
}

export function loadRegisterDraft(storage: DraftStorage): RegisterFormDraftFields | null {
  try {
    const raw = storage.getItem(REGISTER_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const p = parsed as RegisterFormDraftFields
    // Checks every array field, not just emergencyContacts — a draft saved
    // by an older version of this form (e.g. before dependents/bankAccounts
    // existed) would otherwise pass as "valid" and then crash the component
    // the moment it tries to read draft.dependents.length.
    if (!Array.isArray(p.emergencyContacts) || !Array.isArray(p.dependents) || !Array.isArray(p.bankAccounts)) {
      return null
    }
    return p
  } catch {
    return null
  }
}

export function clearRegisterDraft(storage: DraftStorage): void {
  try {
    storage.removeItem(REGISTER_DRAFT_STORAGE_KEY)
  } catch {
    // Same reasoning as saveRegisterDraft — a failed clear shouldn't break
    // the (already-succeeded) registration flow it's called from.
  }
}
