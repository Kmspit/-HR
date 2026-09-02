/**
 * Pure validation for the unified approve+org-assign modal (Phase 1 step 7) —
 * kept free of React so it's testable directly, same reasoning as every
 * other form-validation module in this codebase (no React Testing Library).
 */

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'CONTRACT', 'PART_TIME', 'DAILY', 'INTERN'] as const
export type EmploymentTypeValue = (typeof EMPLOYMENT_TYPES)[number]

export type ApproveAssignmentForm = {
  /** Selected from the JobPosition master list. */
  jobPositionId: string
  /** Typed instead of selecting — creates a new JobPosition on submit.
   *  Exactly one of jobPositionId/newPositionName should be set; both blank
   *  or both set is treated as "no position chosen" / server decides which
   *  one wins (jobPositionId takes priority) respectively. */
  newPositionName: string
  divisionId: string
  departmentId: string
  /** Optional — not every department has sections (matches the existing
   *  standalone org-assign modal's convention). */
  sectionId: string
  employmentType: EmploymentTypeValue | ''
  startDate: string
  /** Only validated when canEditSalary is true — the field is hidden
   *  entirely (not just disabled) for an approver without salary rights,
   *  and approval must still succeed without it. */
  baseSalary: string
  canEditSalary: boolean
}

export type ApproveAssignmentErrors = Partial<Record<
  'position' | 'divisionId' | 'departmentId' | 'employmentType' | 'startDate' | 'baseSalary',
  string
>>

export function validateApproveAssignment(form: ApproveAssignmentForm): ApproveAssignmentErrors {
  const e: ApproveAssignmentErrors = {}

  if (!form.jobPositionId.trim() && !form.newPositionName.trim()) {
    e.position = 'กรุณาเลือกหรือเพิ่มตำแหน่ง'
  }
  if (!form.divisionId) e.divisionId = 'กรุณาเลือกฝ่าย'
  if (!form.departmentId) e.departmentId = 'กรุณาเลือกแผนก'
  if (!form.employmentType) e.employmentType = 'กรุณาเลือกประเภทพนักงาน'

  if (!form.startDate.trim()) {
    e.startDate = 'กรุณาเลือกวันเริ่มงาน'
  } else if (Number.isNaN(new Date(form.startDate).getTime())) {
    e.startDate = 'วันที่ไม่ถูกต้อง'
  }

  if (form.canEditSalary) {
    const trimmed = form.baseSalary.trim()
    if (!trimmed) {
      e.baseSalary = 'กรุณากรอกเงินเดือน'
    } else {
      const n = Number(trimmed)
      if (Number.isNaN(n) || n < 0) e.baseSalary = 'เงินเดือนไม่ถูกต้อง'
    }
  }

  return e
}

export function approveAssignmentHasErrors(errors: ApproveAssignmentErrors): boolean {
  return Object.keys(errors).length > 0
}
