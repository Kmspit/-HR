import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/cloudinary-service', () => ({
  loadUserImageContext: vi.fn().mockResolvedValue({
    userId: 'u1',
    employeeId: 'EMP001',
    branchId: null,
  }),
  payslipFolder: vi.fn().mockReturnValue('hr-system/payslips/EMP001/pay-1'),
}))

import {
  payslipPdfFilename,
  resolvePayslipCloudinaryPublicId,
  resolvePayslipPdfPublicId,
} from '@/lib/payslip-cloudinary-path'

describe('payslip-cloudinary-path', () => {
  it('builds deterministic filename', () => {
    expect(
      payslipPdfFilename({ year: 2026, month: 6, userId: 'u1', employeeId: 'EMP001' }),
    ).toBe('slip_2026_06_EMP001.pdf')
  })

  it('resolves public id matching upload path', async () => {
    const pid = await resolvePayslipCloudinaryPublicId(
      'pay-1',
      'u1',
      'slip_2026_06_EMP001.pdf',
    )
    expect(pid).toBe('hr-system/payslips/EMP001/pay-1/slip_2026_06_EMP001')
  })

  it('prefers stored public id from DB over computed path', async () => {
    const stored = 'hr-system/payslips/uid_u1/pay-1/slip_2026_06_u1'
    const pid = await resolvePayslipPdfPublicId({
      payrollId: 'pay-1',
      userId: 'u1',
      year: 2026,
      month: 6,
      employeeId: 'EMP001',
      storedPublicId: stored,
    })
    expect(pid).toBe(stored)
  })
})
