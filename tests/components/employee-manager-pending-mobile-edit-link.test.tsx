// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/employees',
  useSearchParams: () => new URLSearchParams(),
}))

import EmployeeManager from '@/components/dashboard/EmployeeManager'

afterEach(() => cleanup())

const pendingUser = {
  id: 'u1', name: 'พนักงาน ทดสอบ', email: 'test@co.com', employeeId: null,
  role: 'EMPLOYEE' as const, status: 'PENDING', department: null, position: null,
  phone: null, baseSalary: null, socialSecurity: true,
  startDate: null, lineId: null, isCoworker: false, createdAt: '2026-09-01T00:00:00.000Z',
}

/**
 * Mobile-card gap fixed 2026-09-22 — every other tab's mobile card already
 * links to /employees/[id] (the "all" tab card), but the pending tab's
 * mobile card only had "อนุมัติ"/"ปฏิเสธ" — no way to review/edit a pending
 * employee's submitted info on mobile before approving. Desktop's table
 * already had this via an unconditional "แก้ไข" link.
 */
describe('EmployeeManager — pending tab mobile card has a "แก้ไข" link', () => {
  it('renders a link to /employees/[id] alongside อนุมัติ/ปฏิเสธ', () => {
    render(
      <EmployeeManager
        users={[pendingUser]}
        stats={{ total: 1, pending: 1, active: 0, disabled: 0, terminated: 0, rejected: 0 }}
        initialTab="pending"
        canEditSalary={false}
      />,
    )

    // jsdom doesn't apply the md:hidden/hidden md:block CSS split, so both the
    // mobile card and the desktop table row render at once — scope to
    // buttons/links that actually exist rather than assuming exactly one.
    expect(screen.getAllByRole('button', { name: /อนุมัติ/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /ปฏิเสธ/ }).length).toBeGreaterThan(0)

    // "แก้ไขข้อมูล" (mobile card) has a distinct accessible name from the
    // desktop table's "แก้ไข" link, so this one is unambiguous on its own.
    const editLink = screen.getByRole('link', { name: /แก้ไขข้อมูล/ }) as HTMLAnchorElement
    expect(editLink.getAttribute('href')).toBe('/employees/u1')
  })
})
