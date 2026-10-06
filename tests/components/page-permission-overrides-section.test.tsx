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
 * 2026-10-09 — OVERRIDE_ELIGIBLE_PATHS was narrowed to just '/executive'
 * (/payroll and /reports temporarily removed — see lib/override-eligible-
 * paths.ts's comment on the branch-scoping gap that motivated it), so this
 * file now only ever exercises a single row. `viewerRole` defaults to
 * 'SUPER_ADMIN' (unrestricted) except in the dedicated describe block below
 * that specifically tests the 2026-10-06 anti-privilege-escalation addition.
 */
describe('PagePermissionOverridesSection', () => {
  it('EMPLOYEE role: only "อนุญาตเพิ่ม" (GRANT) is offered for /executive, not "ปิดกั้น" — role already denied by default', () => {
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="EMPLOYEE" viewerRole="SUPER_ADMIN" initialOverrides={[]} />,
    )
    expect(screen.getAllByText('อนุญาตเพิ่ม').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('ปิดกั้น')).toHaveLength(0)
  })

  it('CEO role: only "ปิดกั้น" (RESTRICT) is offered for /executive — role already allowed by default (EXEC_ONLY)', () => {
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="CEO" viewerRole="SUPER_ADMIN" initialOverrides={[]} />,
    )
    expect(screen.getAllByText('ปิดกั้น')).toHaveLength(1)
    expect(screen.queryAllByText('อนุญาตเพิ่ม')).toHaveLength(0)
  })

  it('loads an existing GRANT override and shows its reason', () => {
    render(
      <PagePermissionOverridesSection
        userId="u1"
        employeeRole="EMPLOYEE"
        viewerRole="SUPER_ADMIN"
        initialOverrides={[{ path: '/executive', direction: 'GRANT', reason: 'มอบหมายพิเศษ' }]}
      />,
    )
    expect(screen.getByDisplayValue('มอบหมายพิเศษ')).toBeTruthy()
  })

  it('selecting GRANT then saving PUTs only the non-default rows, with the typed reason', async () => {
    mockApiJson.mockResolvedValue({ ok: true, data: { overrides: [] }, status: 200 })
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="EMPLOYEE" viewerRole="SUPER_ADMIN" initialOverrides={[]} />,
    )

    fireEvent.click(screen.getByText('อนุญาตเพิ่ม'))

    const reasonInput = await screen.findByPlaceholderText('เหตุผล (ไม่บังคับ)')
    fireEvent.change(reasonInput, { target: { value: 'ทดสอบเหตุผล' } })

    fireEvent.click(screen.getByRole('button', { name: /บันทึกสิทธิ์เฉพาะบุคคล/ }))

    await waitFor(() => expect(mockApiJson).toHaveBeenCalled())
    const [url, init] = mockApiJson.mock.calls[0]
    expect(url).toBe('/api/users/u1/page-permissions')
    expect((init as RequestInit).method).toBe('PUT')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.overrides).toEqual([{ path: '/executive', direction: 'GRANT', reason: 'ทดสอบเหตุผล' }])
  })

  it('switching back to "ตามสิทธิ์เดิม" removes that path from the save payload', async () => {
    mockApiJson.mockResolvedValue({ ok: true, data: { overrides: [] }, status: 200 })
    render(
      <PagePermissionOverridesSection
        userId="u1"
        employeeRole="EMPLOYEE"
        viewerRole="SUPER_ADMIN"
        initialOverrides={[{ path: '/executive', direction: 'GRANT', reason: null }]}
      />,
    )

    fireEvent.click(screen.getByText('ตามสิทธิ์เดิม'))
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
 * out a capability the editor lacks. Only /executive exists now (2026-10-09),
 * so these scenarios collapse to one row each.
 */
describe('PagePermissionOverridesSection — viewerRole restricts whether the GRANT button shows', () => {
  it('MANAGER_HR viewer editing an EMPLOYEE: no GRANT button for /executive — MANAGER_HR itself lacks EXEC_ONLY', () => {
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="EMPLOYEE" viewerRole="MANAGER_HR" initialOverrides={[]} />,
    )
    expect(screen.queryAllByText('อนุญาตเพิ่ม')).toHaveLength(0)
    expect(screen.queryAllByText('ปิดกั้น')).toHaveLength(0)
  })

  it('CEO viewer editing an EMPLOYEE: GRANT button shown for /executive — CEO has EXEC_ONLY by default', () => {
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="EMPLOYEE" viewerRole="CEO" initialOverrides={[]} />,
    )
    expect(screen.getAllByText('อนุญาตเพิ่ม')).toHaveLength(1)
  })

  it('RESTRICT is unaffected by viewerRole — MANAGER_HR can still restrict a CEO-role employee from /executive even though MANAGER_HR itself can\'t GRANT it', () => {
    render(
      <PagePermissionOverridesSection userId="u1" employeeRole="CEO" viewerRole="MANAGER_HR" initialOverrides={[]} />,
    )
    expect(screen.getAllByText('ปิดกั้น')).toHaveLength(1)
  })
})
