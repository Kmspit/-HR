// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const { mockApiJson } = vi.hoisted(() => ({ mockApiJson: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/client-api', () => ({
  apiJson: mockApiJson,
  apiErrorMessage: (data: Record<string, unknown>, fallback: string) =>
    (typeof data?.error === 'string' && data.error) || fallback,
}))

import PagePermissionOverridesSection from '@/components/employees/PagePermissionOverridesSection'

afterEach(() => cleanup())
beforeEach(() => mockApiJson.mockReset())

/**
 * 2026-10-02 per-user page-access override feature — the "ระบบ & สิทธิ์" tab
 * section in EmployeeEditClient.tsx. Tested in isolation (same convention as
 * EmployeeProfileTab/SecurityDepositSection, also sub-sections of that same
 * tab) rather than mounting the whole EmployeeEditClient, which needs a much
 * larger prop surface unrelated to this feature.
 */
describe('PagePermissionOverridesSection', () => {
  it('EMPLOYEE role: only "อนุญาตเพิ่ม" (GRANT) is offered for /payroll, not "ปิดกั้น" — role already denied by default', () => {
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="EMPLOYEE" initialOverrides={[]} />,
    )
    expect(screen.getAllByText('อนุญาตเพิ่ม').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('ปิดกั้น')).toHaveLength(0)
  })

  it('MANAGER_HR role: "ปิดกั้น" (RESTRICT) offered for /payroll and /reports (role already allowed there), "อนุญาตเพิ่ม" only for /executive (EXEC_ONLY, not allowed by default)', () => {
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="MANAGER_HR" initialOverrides={[]} />,
    )
    // MANAGER_HR is in HR_CORE ('/payroll') and MGR_UP ('/reports') but not
    // EXEC_ONLY ('/executive') — so RESTRICT shows for 2 rows, GRANT for 1.
    expect(screen.getAllByText('ปิดกั้น')).toHaveLength(2)
    expect(screen.getAllByText('อนุญาตเพิ่ม')).toHaveLength(1)
  })

  it('loads an existing GRANT override and shows its reason', () => {
    render(
      <PagePermissionOverridesSection
        userId="u1"
        employeeRole="EMPLOYEE"
        initialOverrides={[{ path: '/payroll', direction: 'GRANT', reason: 'มอบหมายพิเศษ' }]}
      />,
    )
    expect(screen.getByDisplayValue('มอบหมายพิเศษ')).toBeTruthy()
  })

  it('selecting GRANT then saving PUTs only the non-default rows, with the typed reason', async () => {
    mockApiJson.mockResolvedValue({ ok: true, data: { overrides: [] }, status: 200 })
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="EMPLOYEE" initialOverrides={[]} />,
    )

    const grantButtons = screen.getAllByText('อนุญาตเพิ่ม')
    fireEvent.click(grantButtons[0]) // /payroll row — first in OVERRIDE_ELIGIBLE_PATHS order

    const reasonInput = await screen.findByPlaceholderText('เหตุผล (ไม่บังคับ)')
    fireEvent.change(reasonInput, { target: { value: 'ทดสอบเหตุผล' } })

    fireEvent.click(screen.getByRole('button', { name: /บันทึกสิทธิ์เฉพาะบุคคล/ }))

    await waitFor(() => expect(mockApiJson).toHaveBeenCalled())
    const [url, init] = mockApiJson.mock.calls[0]
    expect(url).toBe('/api/users/u1/page-permissions')
    expect((init as RequestInit).method).toBe('PUT')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.overrides).toEqual([{ path: '/payroll', direction: 'GRANT', reason: 'ทดสอบเหตุผล' }])
  })

  it('switching back to "ตามสิทธิ์เดิม" removes that path from the save payload', async () => {
    mockApiJson.mockResolvedValue({ ok: true, data: { overrides: [] }, status: 200 })
    render(
      <PagePermissionOverridesSection
        userId="u1"
        employeeRole="EMPLOYEE"
        initialOverrides={[{ path: '/payroll', direction: 'GRANT', reason: null }]}
      />,
    )

    fireEvent.click(screen.getAllByText('ตามสิทธิ์เดิม')[0])
    fireEvent.click(screen.getByRole('button', { name: /บันทึกสิทธิ์เฉพาะบุคคล/ }))

    await waitFor(() => expect(mockApiJson).toHaveBeenCalled())
    const [, init] = mockApiJson.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.overrides).toEqual([])
  })
})
