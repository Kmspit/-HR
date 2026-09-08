import { describe, it, expect } from 'vitest'
import { payslipPdfPassword } from '@/lib/payslip-pdf-encrypt'

describe('payslipPdfPassword — backlog: payslip password review (replaces nationalId-based password)', () => {
  it('is deterministic — the same payrollId always yields the same password', () => {
    const a = payslipPdfPassword('payroll-123')
    const b = payslipPdfPassword('payroll-123')
    expect(a).toBe(b)
  })

  it('gives different payrollIds different passwords', () => {
    const a = payslipPdfPassword('payroll-123')
    const b = payslipPdfPassword('payroll-456')
    expect(a).not.toBe(b)
  })

  it('is always exactly 8 digits (zero-padded), never fewer', () => {
    // Try enough ids to have a real chance of exercising the zero-padding path.
    for (let i = 0; i < 200; i++) {
      const password = payslipPdfPassword(`payroll-${i}`)
      expect(password).toMatch(/^\d{8}$/)
    }
  })

  it('never depends on any employee PII — same payrollId, password is stable no matter what (contrast with the old nationalId-based scheme)', () => {
    // The whole point: the function signature doesn't even accept nationalId/
    // phone/birthDate — there is no PII input to vary in the first place.
    const password = payslipPdfPassword('payroll-abc')
    expect(password).toBe(payslipPdfPassword('payroll-abc'))
  })
})
