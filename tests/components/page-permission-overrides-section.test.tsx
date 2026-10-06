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
 *
 * `viewerRole` defaults to 'SUPER_ADMIN' (unrestricted — can GRANT any
 * eligible path) in tests that aren't specifically about the 2026-10-06
 * anti-privilege-escalation addition, so those scenarios keep their original
 * meaning unaffected by the new restriction.
 */
describe('PagePermissionOverridesSection', () => {
  it('EMPLOYEE role: only "อนุญาตเพิ่ม" (GRANT) is offered for /payroll, not "ปิดกั้น" — role already denied by default', () => {
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="EMPLOYEE" viewerRole="SUPER_ADMIN" initialOverrides={[]} />,
    )
    expect(screen.getAllByText('อนุญาตเพิ่ม').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('ปิดกั้น')).toHaveLength(0)
  })

  it('MANAGER_HR role: "ปิดกั้น" (RESTRICT) offered for /payroll and /reports (role already allowed there), "อนุญาตเพิ่ม" only for /executive (EXEC_ONLY, not allowed by default)', () => {
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="MANAGER_HR" viewerRole="SUPER_ADMIN" initialOverrides={[]} />,
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
        viewerRole="SUPER_ADMIN"
        initialOverrides={[{ path: '/payroll', direction: 'GRANT', reason: 'มอบหมายพิเศษ' }]}
      />,
    )
    expect(screen.getByDisplayValue('มอบหมายพิเศษ')).toBeTruthy()
  })

  it('selecting GRANT then saving PUTs only the non-default rows, with the typed reason', async () => {
    mockApiJson.mockResolvedValue({ ok: true, data: { overrides: [] }, status: 200 })
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="EMPLOYEE" viewerRole="SUPER_ADMIN" initialOverrides={[]} />,
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
        viewerRole="SUPER_ADMIN"
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

/**
 * 2026-10-06 security review addition — an editor may only GRANT a path
 * their OWN role already has by default (PUT /api/users/[id]/page-
 * permissions hard-blocks this server-side regardless; this is the UI-side
 * mirror so the editor never sees a button that would just 403 on submit).
 * RESTRICT is never affected — narrowing someone else's access never hands
 * out a capability the editor lacks.
 */
describe('PagePermissionOverridesSection — viewerRole restricts which GRANT buttons show', () => {
  it('MANAGER_HR viewer editing an EMPLOYEE: GRANT offered for /payroll and /reports (MANAGER_HR has both by default), NOT for /executive (MANAGER_HR lacks EXEC_ONLY)', () => {
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="EMPLOYEE" viewerRole="MANAGER_HR" initialOverrides={[]} />,
    )
    // EMPLOYEE has none of the 3 by default, so all 3 rows would show GRANT
    // for an unrestricted viewer — MANAGER_HR's own role caps it to 2.
    expect(screen.getAllByText('อนุญาตเพิ่ม')).toHaveLength(2)
  })

  it('CEO viewer editing an EMPLOYEE: GRANT offered for all 3 paths (CEO has HR_CORE+MGR_UP+EXEC_ONLY by default)', () => {
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="EMPLOYEE" viewerRole="CEO" initialOverrides={[]} />,
    )
    expect(screen.getAllByText('อนุญาตเพิ่ม')).toHaveLength(3)
  })

  it('MANAGER_HR viewer sees zero GRANT buttons when the employee already has everything MANAGER_HR could grant (/payroll, /reports) and lacks only /executive (ungrantable)', () => {
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="MANAGER_HR" viewerRole="MANAGER_HR" initialOverrides={[]} />,
    )
    // /payroll, /reports: employee already has them (roleDefaultAllowed) ->
    // RESTRICT shown, not GRANT. /executive: employee lacks it AND viewer
    // can't grant it either -> neither button shows for that row.
    expect(screen.queryAllByText('อนุญาตเพิ่ม')).toHaveLength(0)
    expect(screen.getAllByText('ปิดกั้น')).toHaveLength(2)
  })

  it('RESTRICT is unaffected by viewerRole — MANAGER_HR can still restrict a MANAGER_HR-role employee from /executive-adjacent paths it already has', () => {
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="MANAGER_HR" viewerRole="MANAGER_HR" initialOverrides={[]} />,
    )
    // Confirms RESTRICT count is identical regardless of viewer's own access —
    // same 2 RESTRICT rows as the SUPER_ADMIN-viewer test above.
    expect(screen.getAllByText('ปิดกั้น')).toHaveLength(2)
  })
})
