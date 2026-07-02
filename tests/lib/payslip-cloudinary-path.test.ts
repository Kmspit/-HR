import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/cloudinary-service', () => ({
  loadUserImageContext: vi.fn().mockResolvedValue({
    userId: 'u1',
    employeeId: 'EMP001',
    branchId: null,
  }),
  payslipFolder: vi.fn().mockReturnValue('hr-system/payslips/EMP001/pay-1'),
}))

import { payslipPdfFilename, resolvePayslipCloudinaryPublicId } from '@/lib/payslip-cloudinary-path'

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
})
