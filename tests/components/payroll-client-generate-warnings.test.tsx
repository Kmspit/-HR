// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const { mockApiJson, toastWarning, toastSuccess, toastError } = vi.hoisted(() => ({
  mockApiJson: vi.fn(),
  toastWarning: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: toastSuccess, warning: toastWarning, error: toastError } }))
vi.mock('@/lib/client-api', () => ({
  apiJson: mockApiJson,
  apiErrorMessage: (data: Record<string, unknown>, fallback: string) =>
    (typeof data?.error === 'string' && data.error) || fallback,
}))

import PayrollClient from '@/app/(dashboard)/payroll/PayrollClient'

afterEach(() => cleanup())
beforeEach(() => {
  mockApiJson.mockReset()
  toastWarning.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

function clickGenerate() {
  fireEvent.click(screen.getByRole('button', { name: /คำนวณ/ }))
}

/**
 * Bug-scan finding (2026-09-30): app/api/payroll/generate/route.ts has
 * returned `deletedWarning` and `disabledWarning` in its JSON response for a
 * long time — deletedWarning flags payrolls that couldn't regenerate because
 * they were soft-deleted, disabledWarning flags employees paid a full
 * month's salary because their account was disabled mid-period and the
 * system couldn't prorate. generate()'s inline response type never declared
 * either field and never rendered them anywhere — the exact same dead-field
 * pattern already fixed for negativeNetSalaryWarning. Fixed by reading both
 * and showing them via toast.warning(), identically to how
 * negativeNetSalaryWarning/skippedApproved already work.
 */
describe('PayrollClient — generate() surfaces disabledWarning/deletedWarning (2026-09-30 bug-scan fix)', () => {
  it('shows a toast.warning for disabledWarning when the backend returns one', async () => {
    mockApiJson.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        count: 2,
        disabledWarning: '⚠️ รวม 1 พนักงานรายเดือนที่ปิดบัญชีเดือนนี้ด้วยยอดเต็มเดือน กรุณาตรวจสอบก่อนอนุมัติ: พนักงาน หนึ่ง',
      },
    })

    render(<PayrollClient month={9} year={2026} payrolls={[]} />)
    clickGenerate()

    await waitFor(() => expect(toastWarning).toHaveBeenCalledWith(
      expect.stringContaining('ปิดบัญชีเดือนนี้ด้วยยอดเต็มเดือน'),
    ))
  })

  it('shows a toast.warning for deletedWarning when the backend returns one', async () => {
    mockApiJson.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        count: 1,
        deletedWarning: 'ต้องกู้คืนก่อนถึงจะคำนวณใหม่ได้ — 1 รายการถูกลบไปแล้ว: พนักงาน สอง',
      },
    })

    render(<PayrollClient month={9} year={2026} payrolls={[]} />)
    clickGenerate()

    await waitFor(() => expect(toastWarning).toHaveBeenCalledWith(
      expect.stringContaining('ต้องกู้คืนก่อนถึงจะคำนวณใหม่ได้'),
    ))
  })

  it('shows separate toasts when both disabledWarning and deletedWarning are present at once, plus negativeNetSalaryWarning too', async () => {
    mockApiJson.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        count: 3,
        deletedWarning: 'deleted-warning-text',
        disabledWarning: 'disabled-warning-text',
        negativeNetSalaryWarning: 'negative-net-warning-text',
      },
    })

    render(<PayrollClient month={9} year={2026} payrolls={[]} />)
    clickGenerate()

    await waitFor(() => expect(toastWarning).toHaveBeenCalledTimes(3))
    const calls = toastWarning.mock.calls.map((c) => c[0])
    expect(calls).toContain('deleted-warning-text')
    expect(calls).toContain('disabled-warning-text')
    expect(calls).toContain('negative-net-warning-text')
  })

  it('does not call toast.warning at all when the backend returns none of these fields (clean generate)', async () => {
    mockApiJson.mockResolvedValue({ ok: true, status: 200, data: { count: 5 } })

    render(<PayrollClient month={9} year={2026} payrolls={[]} />)
    clickGenerate()

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(toastWarning).not.toHaveBeenCalled()
  })
})
