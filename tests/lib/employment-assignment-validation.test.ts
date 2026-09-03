import { describe, it, expect } from 'vitest'
import { validateNewAssignment, newAssignmentHasErrors, type NewAssignmentForm } from '@/lib/employment-assignment-validation'

const TODAY = new Date('2026-09-03T00:00:00Z')
const LATEST = new Date('2026-01-01T00:00:00Z')

function form(overrides: Partial<NewAssignmentForm> = {}): NewAssignmentForm {
  return {
    changeType: 'PROMOTION',
    effectiveFrom: '2026-09-01',
    reason: '', note: '',
    jobPositionId: 'pos-1', newPositionName: '',
    divisionId: 'div-1', departmentId: 'dept-1', sectionId: '',
    employmentType: 'FULL_TIME',
    baseSalary: '30000',
    canEditSalary: true,
    terminationType: '', terminationReason: '', rehireEligible: null,
    ...overrides,
  }
}

const ctx = { latestEffectiveFrom: LATEST, today: TODAY }

describe('validateNewAssignment — general', () => {
  it('passes a fully valid PROMOTION form', () => {
    expect(newAssignmentHasErrors(validateNewAssignment(form(), ctx))).toBe(false)
  })

  it('requires changeType', () => {
    expect(validateNewAssignment(form({ changeType: '' }), ctx).changeType).toBeTruthy()
  })

  it('requires a parseable effectiveFrom', () => {
    expect(validateNewAssignment(form({ effectiveFrom: '' }), ctx).effectiveFrom).toBeTruthy()
    expect(validateNewAssignment(form({ effectiveFrom: 'not-a-date' }), ctx).effectiveFrom).toBeTruthy()
  })

  it('blocks a future effectiveFrom', () => {
    expect(validateNewAssignment(form({ effectiveFrom: '2026-09-04' }), ctx).effectiveFrom).toBeTruthy()
  })

  it('allows effectiveFrom equal to today', () => {
    const errors = validateNewAssignment(form({ effectiveFrom: '2026-09-03' }), ctx)
    expect(errors.effectiveFrom).toBeUndefined()
  })

  it('blocks effectiveFrom strictly before the latest existing assignment', () => {
    expect(validateNewAssignment(form({ effectiveFrom: '2025-12-01' }), ctx).effectiveFrom).toBeTruthy()
  })

  it('allows effectiveFrom equal to the latest existing assignment (same-day backfill, e.g. a same-day promotion + termination)', () => {
    const errors = validateNewAssignment(form({ effectiveFrom: '2026-01-01' }), ctx)
    expect(errors.effectiveFrom).toBeUndefined()
  })

  it('allows any past-but-after-latest date when there is no existing assignment yet', () => {
    const errors = validateNewAssignment(form({ effectiveFrom: '2020-01-01' }), { latestEffectiveFrom: null, today: TODAY })
    expect(errors.effectiveFrom).toBeUndefined()
  })
})

describe('validateNewAssignment — PROMOTION/TRANSFER/CONTRACT_RENEW fields', () => {
  it('requires a position (either existing id or a new name)', () => {
    expect(validateNewAssignment(form({ jobPositionId: '', newPositionName: '' }), ctx).position).toBeTruthy()
    expect(validateNewAssignment(form({ jobPositionId: '', newPositionName: 'ผู้จัดการใหม่' }), ctx).position).toBeUndefined()
  })

  it('requires divisionId and departmentId, but not sectionId', () => {
    expect(validateNewAssignment(form({ divisionId: '' }), ctx).divisionId).toBeTruthy()
    expect(validateNewAssignment(form({ departmentId: '' }), ctx).departmentId).toBeTruthy()
    expect(validateNewAssignment(form({ sectionId: '' }), ctx).departmentId).toBeUndefined()
  })

  it('requires a valid employmentType', () => {
    expect(validateNewAssignment(form({ employmentType: '' }), ctx).employmentType).toBeTruthy()
  })

  it('requires baseSalary only when canEditSalary is true', () => {
    expect(validateNewAssignment(form({ canEditSalary: true, baseSalary: '' }), ctx).baseSalary).toBeTruthy()
    expect(validateNewAssignment(form({ canEditSalary: false, baseSalary: '' }), ctx).baseSalary).toBeUndefined()
  })

  it('rejects a negative or non-numeric baseSalary', () => {
    expect(validateNewAssignment(form({ baseSalary: '-5' }), ctx).baseSalary).toBeTruthy()
    expect(validateNewAssignment(form({ baseSalary: 'abc' }), ctx).baseSalary).toBeTruthy()
  })

  it('never requires terminationType/rehireEligible for a non-TERMINATION change', () => {
    const errors = validateNewAssignment(form({ terminationType: '', rehireEligible: null }), ctx)
    expect(errors.terminationType).toBeUndefined()
    expect(errors.rehireEligible).toBeUndefined()
  })
})

describe('validateNewAssignment — TERMINATION', () => {
  function terminationForm(overrides: Partial<NewAssignmentForm> = {}): NewAssignmentForm {
    return form({
      changeType: 'TERMINATION',
      jobPositionId: '', newPositionName: '', divisionId: '', departmentId: '', employmentType: '', baseSalary: '',
      terminationType: 'RESIGN', rehireEligible: true,
      ...overrides,
    })
  }

  it('passes a fully valid TERMINATION form with no position/salary fields required', () => {
    expect(newAssignmentHasErrors(validateNewAssignment(terminationForm(), ctx))).toBe(false)
  })

  it('requires terminationType', () => {
    expect(validateNewAssignment(terminationForm({ terminationType: '' }), ctx).terminationType).toBeTruthy()
  })

  it('requires rehireEligible to be explicitly chosen (true or false), not left null', () => {
    expect(validateNewAssignment(terminationForm({ rehireEligible: null }), ctx).rehireEligible).toBeTruthy()
    expect(validateNewAssignment(terminationForm({ rehireEligible: false }), ctx).rehireEligible).toBeUndefined()
  })

  it('never requires position/division/department/employmentType/baseSalary for TERMINATION', () => {
    const errors = validateNewAssignment(terminationForm(), ctx)
    expect(errors.position).toBeUndefined()
    expect(errors.divisionId).toBeUndefined()
    expect(errors.departmentId).toBeUndefined()
    expect(errors.employmentType).toBeUndefined()
    expect(errors.baseSalary).toBeUndefined()
  })
})
