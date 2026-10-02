// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/employees',
  useSearchParams: () => new URLSearchParams(),
}))

import EmployeeManager from '@/components/dashboard/EmployeeManager'

afterEach(() => cleanup())

function makeUser(overrides: Partial<Parameters<typeof EmployeeManager>[0]['users'][number]>) {
  return {
    id: 'u1', name: 'ทดสอบ ระบบ', email: 'test@co.com', employeeId: null,
    role: 'EMPLOYEE' as const, status: 'ACTIVE', department: null, position: null,
    phone: null, baseSalary: null, socialSecurity: true,
    startDate: null, lineId: null, isCoworker: false, createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

/**
 * Bug reported 2026-10-02 from a real screenshot: roleBadge()'s long labels
 * (CEO: "ผู้บริหาร (CEO)", HR: "ฝ่ายบุคคล (HR)") wrapped onto 2 lines in the
 * employee table while short labels (e.g. "พนักงาน") stayed on one line —
 * the span had no `whitespace-nowrap`, so a squeezed Role column let the
 * long labels wrap instead of the table falling back to the pre-existing
 * `.table-scroll` horizontal-scroll behavior.
 *
 * jsdom has no real layout engine, so it can't measure actual line-wrapping
 * — this asserts the fix at the only level jsdom can verify (the class is
 * present). The actual wrap-vs-no-wrap visual behavior was verified
 * separately with a real headless-Chromium render (Tailwind JIT applying
 * the exact same utility classes) reproducing both the bug and the fix at a
 * squeezed viewport width.
 */
describe('EmployeeManager — roleBadge() has whitespace-nowrap (2026-10-02 bug fix)', () => {
  it('CEO badge ("ผู้บริหาร (CEO)") carries whitespace-nowrap', () => {
    render(
      <EmployeeManager
        users={[makeUser({ role: 'CEO' as const })]}
        stats={{ total: 1, pending: 0, active: 1, disabled: 0, terminated: 0, rejected: 0 }}
        initialTab="all"
        canEditSalary={false}
      />,
    )
    // ROLE_DESCRIPTIONS' text is also used by an unrelated "บทบาท:" legend
    // span elsewhere in the component (for MANAGER_HR/HR/ADMIN) — scope to
    // the actual badge span (rounded-md, the roleBadge()-only class) so a
    // shared tooltip title never causes a false match on the wrong element.
    const badges = screen.getAllByTitle('ผู้บริหาร — ดูภาพรวมและอนุมัติระดับสูง')
      .filter((el) => el.className.includes('rounded-md'))
    expect(badges.length).toBeGreaterThan(0)
    for (const badge of badges) {
      expect(badge.className).toContain('whitespace-nowrap')
      expect(badge.textContent).toContain('ผู้บริหาร (CEO)')
    }
  })

  it('HR badge ("ฝ่ายบุคคล (HR)") carries whitespace-nowrap', () => {
    render(
      <EmployeeManager
        users={[makeUser({ role: 'HR' as const })]}
        stats={{ total: 1, pending: 0, active: 1, disabled: 0, terminated: 0, rejected: 0 }}
        initialTab="all"
        canEditSalary={false}
      />,
    )
    // Same shared-title caveat as the CEO test above — the "บทบาท:" legend
    // also renders an HR entry with this exact title text.
    const badges = screen.getAllByTitle('ฝ่ายบุคคล — ดูแลพนักงาน เงินเดือน ลา (ไม่ใช่ Admin ระบบ)')
      .filter((el) => el.className.includes('rounded-md'))
    expect(badges.length).toBeGreaterThan(0)
    for (const badge of badges) {
      expect(badge.className).toContain('whitespace-nowrap')
      expect(badge.textContent).toContain('ฝ่ายบุคคล (HR)')
    }
  })

  it('short labels (e.g. EMPLOYEE "พนักงาน") also carry whitespace-nowrap — same span, same class for everyone', () => {
    render(
      <EmployeeManager
        users={[makeUser({ role: 'EMPLOYEE' as const })]}
        stats={{ total: 1, pending: 0, active: 1, disabled: 0, terminated: 0, rejected: 0 }}
        initialTab="all"
        canEditSalary={false}
      />,
    )
    const badges = screen.getAllByText(/พนักงาน$/)
    const roleBadge = badges.find((b) => b.className.includes('cursor-help'))
    expect(roleBadge).toBeTruthy()
    expect(roleBadge!.className).toContain('whitespace-nowrap')
  })
})
