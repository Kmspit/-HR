/**
 * State machine for the "ผู้ติดต่อ & บัญชีธนาคาร" tab's initial fetch — same
 * shape/reasoning as lib/employee-profile-load.ts and, before it,
 * lib/employee-history-load.ts (see that file's header comment for the bug
 * class this pattern exists to avoid).
 */

export type PersonalRecordsEmergencyContact = {
  id: string
  name: string
  relationship: string
  phone: string
  altPhone: string | null
  address: string | null
  isPrimary: boolean
}

export type PersonalRecordsDependent = {
  id: string
  name: string
  relationType: 'SPOUSE' | 'CHILD' | 'PARENT' | 'OTHER'
  birthDate: string | null
  nationalIdLast4: string | null
  isTaxAllowance: boolean
  note: string | null
}

export type PersonalRecordsBankAccount = {
  id: string
  bankCode: string
  accountName: string
  accountNumberLast4: string
  accountType: string | null
  isPrimary: boolean
  isActive: boolean
}

export type PersonalRecordsData = {
  emergencyContacts: PersonalRecordsEmergencyContact[]
  dependents: PersonalRecordsDependent[]
  bankAccounts: PersonalRecordsBankAccount[]
}

export type PersonalRecordsLoadState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'loaded'; data: PersonalRecordsData }
  | { phase: 'error'; message: string; canRetry: boolean }

export type PersonalRecordsLoadAction =
  | { type: 'START' }
  | { type: 'SUCCESS'; data: PersonalRecordsData }
  | { type: 'FAILURE'; status: number }

export const initialPersonalRecordsLoadState: PersonalRecordsLoadState = { phase: 'idle' }

export function personalRecordsLoadErrorMessage(status: number): string {
  if (status === 403) return 'ไม่มีสิทธิ์ดูข้อมูลนี้'
  return 'โหลดข้อมูลไม่สำเร็จ'
}

export function personalRecordsLoadCanRetry(status: number): boolean {
  return status !== 403
}

export function personalRecordsLoadReducer(
  state: PersonalRecordsLoadState,
  action: PersonalRecordsLoadAction,
): PersonalRecordsLoadState {
  switch (action.type) {
    case 'START':
      return { phase: 'loading' }
    case 'SUCCESS':
      return { phase: 'loaded', data: action.data }
    case 'FAILURE':
      return {
        phase: 'error',
        message: personalRecordsLoadErrorMessage(action.status),
        canRetry: personalRecordsLoadCanRetry(action.status),
      }
    default:
      return state
  }
}

export function shouldStartPersonalRecordsLoad(active: boolean, alreadyStarted: boolean): boolean {
  return active && !alreadyStarted
}
