import { describe, it, expect } from 'vitest'
import {
  payslipLinePdfUrl,
  assertLineFlexUriLength,
  LINE_FLEX_URI_MAX,
  createPayslipPdfAccessToken,
  validateAppBaseUrl,
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

  it('validateAppBaseUrl fails when env missing', () => {
    const prev = process.env.NEXTAUTH_URL
    process.env.NEXTAUTH_URL = ''
    process.env.NEXT_PUBLIC_APP_URL = ''
    expect(validateAppBaseUrl().ok).toBe(false)
    process.env.NEXTAUTH_URL = prev
  })

  it('validateAppBaseUrl rejects localhost in production', () => {
    const prevEnv = process.env.NODE_ENV
    const prevUrl = process.env.NEXTAUTH_URL
    process.env.NODE_ENV = 'production'
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    expect(validateAppBaseUrl().ok).toBe(false)
    process.env.NODE_ENV = prevEnv
    process.env.NEXTAUTH_URL = prevUrl
  })
})
