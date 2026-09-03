/**
 * State machine for the "ประวัติตำแหน่ง" tab's initial fetch (Phase 1
 * step 8c) — same shape/reasoning as lib/employee-profile-load.ts and, before
 * it, lib/employee-history-load.ts (see that file's header comment for the
 * bug class this pattern exists to avoid).
 */

export type EmploymentAssignmentRow = {
  id: string
  effectiveFrom: string
  changeType: 'HIRE' | 'PROBATION_PASS' | 'PROMOTION' | 'TRANSFER' | 'CONTRACT_RENEW' | 'TERMINATION'
  jobPositionId: string
  positionName: string
  divisionId: string | null
  divisionName: string | null
  departmentId: string | null
  departmentName: string | null
  sectionId: string | null
  sectionName: string | null
  employmentType: 'FULL_TIME' | 'CONTRACT' | 'PART_TIME' | 'DAILY' | 'INTERN'
  /** Absent entirely (not null) for a viewer without salary-view rights —
   *  see the route's own comment on why it's omitted, not just masked. */
  baseSalary?: number | null
  terminationType: 'RESIGN' | 'DISMISS' | 'CONTRACT_END' | 'RETIRE' | 'DECEASED' | null
  terminationReason: string | null
  rehireEligible: boolean | null
  reason: string | null
  note: string | null
  createdByName: string | null
  createdAt: string
}

export type EmploymentAssignmentsData = {
  currentAssignmentId: string | null
  assignments: EmploymentAssignmentRow[]
}

export type EmploymentAssignmentsLoadState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'loaded'; data: EmploymentAssignmentsData }
  | { phase: 'error'; message: string; canRetry: boolean }

export type EmploymentAssignmentsLoadAction =
  | { type: 'START' }
  | { type: 'SUCCESS'; data: EmploymentAssignmentsData }
  | { type: 'FAILURE'; status: number }

export const initialEmploymentAssignmentsLoadState: EmploymentAssignmentsLoadState = { phase: 'idle' }

export function employmentAssignmentsLoadErrorMessage(status: number): string {
  if (status === 403) return 'ไม่มีสิทธิ์ดูประวัติตำแหน่ง'
  return 'โหลดประวัติตำแหน่งไม่สำเร็จ'
}

export function employmentAssignmentsLoadCanRetry(status: number): boolean {
  return status !== 403
}

export function employmentAssignmentsLoadReducer(
  state: EmploymentAssignmentsLoadState,
  action: EmploymentAssignmentsLoadAction,
): EmploymentAssignmentsLoadState {
  switch (action.type) {
    case 'START':
      return { phase: 'loading' }
    case 'SUCCESS':
      return { phase: 'loaded', data: action.data }
    case 'FAILURE':
      return {
        phase: 'error',
        message: employmentAssignmentsLoadErrorMessage(action.status),
        canRetry: employmentAssignmentsLoadCanRetry(action.status),
      }
    default:
      return state
  }
}

export function shouldStartEmploymentAssignmentsLoad(active: boolean, alreadyStarted: boolean): boolean {
  return active && !alreadyStarted
}
