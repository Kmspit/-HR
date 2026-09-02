import { describe, it, expect } from 'vitest'
import {
  validateApproveAssignment,
  approveAssignmentHasErrors,
  type ApproveAssignmentForm,
} from '@/lib/approve-assignment-validation'

const validFormWithSalary: ApproveAssignmentForm = {
  jobPositionId: 'pos-1', newPositionName: '',
  divisionId: 'div-1', departmentId: 'dept-1', sectionId: '',
  employmentType: 'FULL_TIME', startDate: '2026-09-01',
  baseSalary: '25000', canEditSalary: true,
}

describe('validateApproveAssignment', () => {
  it('passes a fully-filled form with salary (HR_ADMIN approver)', () => {
    const e = validateApproveAssignment(validFormWithSalary)
    expect(e).toEqual({})
    expect(approveAssignmentHasErrors(e)).toBe(false)
  })

  it('passes with newPositionName instead of jobPositionId — creating a new position', () => {
    const e = validateApproveAssignment({ ...validFormWithSalary, jobPositionId: '', newPositionName: 'ตำแหน่งใหม่' })
    expect(e.position).toBeUndefined()
  })

  it('requires either jobPositionId or newPositionName', () => {
    const e = validateApproveAssignment({ ...validFormWithSalary, jobPositionId: '', newPositionName: '' })
    expect(e.position).toBeTruthy()
  })

  it('requires divisionId and departmentId', () => {
    const e = validateApproveAssignment({ ...validFormWithSalary, divisionId: '', departmentId: '' })
    expect(e.divisionId).toBeTruthy()
    expect(e.departmentId).toBeTruthy()
  })

  it('does not require sectionId — matches the existing standalone org-assign convention', () => {
    const e = validateApproveAssignment({ ...validFormWithSalary, sectionId: '' })
    expect(e).toEqual({})
  })

  it('requires employmentType', () => {
    const e = validateApproveAssignment({ ...validFormWithSalary, employmentType: '' })
    expect(e.employmentType).toBeTruthy()
  })

  it('requires a valid startDate', () => {
    expect(validateApproveAssignment({ ...validFormWithSalary, startDate: '' }).startDate).toBeTruthy()
    expect(validateApproveAssignment({ ...validFormWithSalary, startDate: 'not-a-date' }).startDate).toBeTruthy()
  })

  describe('baseSalary — only required when canEditSalary is true', () => {
    it('requires baseSalary when canEditSalary is true and it is blank', () => {
      const e = validateApproveAssignment({ ...validFormWithSalary, baseSalary: '' })
      expect(e.baseSalary).toBeTruthy()
    })

    it('rejects a negative or non-numeric baseSalary when canEditSalary is true', () => {
      expect(validateApproveAssignment({ ...validFormWithSalary, baseSalary: '-100' }).baseSalary).toBeTruthy()
      expect(validateApproveAssignment({ ...validFormWithSalary, baseSalary: 'abc' }).baseSalary).toBeTruthy()
    })

    it('never requires baseSalary when canEditSalary is false — approval must still succeed without it', () => {
      const e = validateApproveAssignment({ ...validFormWithSalary, canEditSalary: false, baseSalary: '' })
      expect(e.baseSalary).toBeUndefined()
      expect(approveAssignmentHasErrors(e)).toBe(false)
    })
  })

  it('flags every missing required field independently', () => {
    const e = validateApproveAssignment({
      jobPositionId: '', newPositionName: '',
      divisionId: '', departmentId: '', sectionId: '',
      employmentType: '', startDate: '',
      baseSalary: '', canEditSalary: true,
    })
    expect(Object.keys(e).sort()).toEqual(
      ['baseSalary', 'departmentId', 'divisionId', 'employmentType', 'position', 'startDate'].sort(),
    )
  })
})
