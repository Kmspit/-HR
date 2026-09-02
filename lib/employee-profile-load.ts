import type { RegisterAddress } from '@/lib/register-form-validation'

/**
 * State machine for the "ข้อมูลส่วนตัวเพิ่มเติม" tab's initial fetch — same
 * shape and same reasoning as lib/employee-history-load.ts (kept plain, no
 * React, so "every path reaches a terminal state" stays testable, and so a
 * `phase`-as-effect-dependency footgun like the one that file's header
 * describes can't recur here either).
 */

export type EmployeeProfileLoadData = {
  nationality: string
  maritalStatus: string
  personalEmail: string
  currentAddress: RegisterAddress
  registeredAddress: RegisterAddress
  sameAsCurrentAddress: boolean
}

export type EmployeeProfileLoadState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'loaded'; data: EmployeeProfileLoadData }
  | { phase: 'error'; message: string; canRetry: boolean }

export type EmployeeProfileLoadAction =
  | { type: 'START' }
  | { type: 'SUCCESS'; data: EmployeeProfileLoadData }
  | { type: 'FAILURE'; status: number }

export const initialEmployeeProfileLoadState: EmployeeProfileLoadState = { phase: 'idle' }

export function employeeProfileLoadErrorMessage(status: number): string {
  if (status === 403) return 'ไม่มีสิทธิ์ดูข้อมูลนี้'
  return 'โหลดข้อมูลไม่สำเร็จ'
}

export function employeeProfileLoadCanRetry(status: number): boolean {
  return status !== 403
}

export function employeeProfileLoadReducer(
  state: EmployeeProfileLoadState,
  action: EmployeeProfileLoadAction,
): EmployeeProfileLoadState {
  switch (action.type) {
    case 'START':
      return { phase: 'loading' }
    case 'SUCCESS':
      return { phase: 'loaded', data: action.data }
    case 'FAILURE':
      return {
        phase: 'error',
        message: employeeProfileLoadErrorMessage(action.status),
        canRetry: employeeProfileLoadCanRetry(action.status),
      }
    default:
      return state
  }
}

export function shouldStartEmployeeProfileLoad(active: boolean, alreadyStarted: boolean): boolean {
  return active && !alreadyStarted
}
