import { describe, it, expect } from 'vitest'
import {
  payslipLinePdfUrl,
  assertLineFlexUriLength,
  LINE_FLEX_URI_MAX,
  createPayslipPdfAccessToken,
} from '@/lib/payslip-pdf-access'

describe('payslip-pdf-access', () => {
  it('builds short proxy URL under LINE flex limit', () => {
    const token = 'a'.repeat(120)
    const url = payslipLinePdfUrl('pay-abc123', 'https://hr.example.com', token)
    expect(url).toContain('/api/payslip/pay-abc123/line-pdf')
    expect(url.length).toBeLessThan(LINE_FLEX_URI_MAX)
    expect(assertLineFlexUriLength(url)).toBeNull()
  })

  it('real JWT stays under LINE flex limit with long payroll id', async () => {
    const payrollId = 'clx' + 'a'.repeat(24)
    const token = await createPayslipPdfAccessToken(payrollId)
    const url = payslipLinePdfUrl(
      payrollId,
      'https://hrprogramkm.vercel.app',
      token,
    )
    expect(url.length).toBeLessThan(LINE_FLEX_URI_MAX)
    expect(assertLineFlexUriLength(url)).toBeNull()
  })

  it('rejects URL over LINE flex limit', () => {
    const long = 'https://example.com/' + 'x'.repeat(LINE_FLEX_URI_MAX)
    expect(assertLineFlexUriLength(long)).toContain('1000')
  })
})
