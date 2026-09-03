import { EMPLOYMENT_TYPES, type EmploymentTypeValue } from '@/lib/approve-assignment-validation'

/**
 * Pure validation for the "สร้างประวัติตำแหน่งใหม่" form (Phase 1 step 8c) —
 * same field/error shape convention as lib/approve-assignment-validation.ts
 * (step 7's approve+HIRE form), reused here for the smaller set of change
 * types this form actually offers. HIRE/PROBATION_PASS are deliberately
 * excluded — HIRE only ever happens via the approve flow (step 7), and
 * PROBATION_PASS isn't part of this step's brief.
 */

export const ASSIGNMENT_CHANGE_TYPES = ['PROMOTION', 'TRANSFER', 'CONTRACT_RENEW', 'TERMINATION'] as const
export type AssignmentChangeTypeValue = (typeof ASSIGNMENT_CHANGE_TYPES)[number]

export const TERMINATION_TYPES = ['RESIGN', 'DISMISS', 'CONTRACT_END', 'RETIRE', 'DECEASED'] as const
export type TerminationTypeValue = (typeof TERMINATION_TYPES)[number]

export type NewAssignmentForm = {
  changeType: AssignmentChangeTypeValue | ''
  effectiveFrom: string
  reason: string
  note: string
  // Required for PROMOTION/TRANSFER/CONTRACT_RENEW — not asked for
  // TERMINATION, which carries the current position/salary/etc forward
  // unchanged instead (see the route's own comment for why).
  jobPositionId: string
  newPositionName: string
  divisionId: string
  departmentId: string
  sectionId: string
  employmentType: EmploymentTypeValue | ''
  baseSalary: string
  /** HR_ADMIN only, same gate as step 7's salary field — computed by the
   *  caller from the viewer's role, not part of what gets validated itself. */
  canEditSalary: boolean
  // TERMINATION-only fields.
  terminationType: TerminationTypeValue | ''
  terminationReason: string
  /** null = not yet chosen — kept distinct from false so an admin can't
   *  accidentally submit "not eligible for rehire" just by never touching
   *  the toggle. */
  rehireEligible: boolean | null
}

export type NewAssignmentErrors = Partial<Record<
  'changeType' | 'effectiveFrom' | 'position' | 'divisionId' | 'departmentId' | 'employmentType' | 'baseSalary' | 'terminationType' | 'rehireEligible',
  string
>>

/**
 * effectiveFrom must land strictly after the employee's most recent existing
 * assignment (never blank/tie — ambiguous ordering breaks
 * getAssignmentAsOf's "most recent as of date" derivation) and never in the
 * future (a future-dated row would need a deferred sync job that doesn't
 * exist yet — see the route's own comment; blocking it here is the
 * documented, deliberate scope cut for this step, not an oversight).
 * `context` is passed in rather than read from Date.now()/a live query so
 * this stays a pure, easily-testable function.
 */
export function validateNewAssignment(
  form: NewAssignmentForm,
  context: { latestEffectiveFrom: Date | null; today: Date },
): NewAssignmentErrors {
  const errors: NewAssignmentErrors = {}

  if (!form.changeType) errors.changeType = 'กรุณาเลือกประเภทการเปลี่ยนแปลง'

  const effectiveDate = form.effectiveFrom ? new Date(form.effectiveFrom) : null
  if (!effectiveDate || Number.isNaN(effectiveDate.getTime())) {
    errors.effectiveFrom = 'กรุณาระบุวันที่มีผล'
  } else {
    const todayEnd = new Date(context.today)
    todayEnd.setHours(23, 59, 59, 999)
    if (effectiveDate.getTime() > todayEnd.getTime()) {
      errors.effectiveFrom = 'ไม่สามารถระบุวันที่ในอนาคตได้'
    } else if (context.latestEffectiveFrom && effectiveDate.getTime() <= context.latestEffectiveFrom.getTime()) {
      errors.effectiveFrom = 'วันที่มีผลต้องอยู่หลังประวัติล่าสุด'
    }
  }

  if (form.changeType === 'TERMINATION') {
    if (!form.terminationType || !(TERMINATION_TYPES as readonly string[]).includes(form.terminationType)) {
      errors.terminationType = 'กรุณาเลือกสาเหตุการพ้นสภาพ'
    }
    if (form.rehireEligible === null) {
      errors.rehireEligible = 'กรุณาระบุสิทธิ์การกลับเข้าทำงาน'
    }
  } else if (form.changeType) {
    if (!form.jobPositionId && !form.newPositionName.trim()) {
      errors.position = 'กรุณาเลือกหรือเพิ่มตำแหน่ง'
    }
    if (!form.divisionId) errors.divisionId = 'กรุณาเลือกฝ่าย'
    if (!form.departmentId) errors.departmentId = 'กรุณาเลือกแผนก'
    if (!form.employmentType || !(EMPLOYMENT_TYPES as readonly string[]).includes(form.employmentType)) {
      errors.employmentType = 'กรุณาเลือกประเภทพนักงาน'
    }
    if (form.canEditSalary) {
      if (!form.baseSalary.trim()) {
        errors.baseSalary = 'กรุณากรอกเงินเดือน'
      } else {
        const n = Number(form.baseSalary)
        if (Number.isNaN(n) || n < 0) errors.baseSalary = 'เงินเดือนไม่ถูกต้อง'
      }
    }
  }

  return errors
}

export function newAssignmentHasErrors(errors: NewAssignmentErrors): boolean {
  return Object.keys(errors).length > 0
}
