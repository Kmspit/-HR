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
 * 2026-10-02 bug-scan round 2, finding #1 (highest severity): statusBadge()
 * sits in the exact same file/table as roleBadge() (fixed previously, same
 * bug class) — one column over — but was missed in that fix. "รอ Approve"
 * (Thai+English mixed with a space) is the riskiest label in this set,
 * same shape as "ผู้บริหาร (CEO)" that caused the original bug.
 *
 * jsdom has no real layout engine, so this asserts the fix at the only
 * level jsdom can verify (the class is present) — the real wrap-vs-no-wrap
 * behavior was verified separately with a real headless-Chromium render at
 * a forced-narrow column width, reproducing both the bug and the fix.
 */
describe('statusBadge() in EmployeeManager.tsx — same file/table as roleBadge(), one column over', () => {
  it('PENDING badge ("รอ Approve" — Thai+English mixed, the riskiest label) carries whitespace-nowrap', () => {
    render(
      <EmployeeManager
        users={[makeUser({ status: 'PENDING' })]}
        stats={{ total: 1, pending: 1, active: 0, disabled: 0, terminated: 0, rejected: 0 }}
        initialTab="pending"
        canEditSalary={false}
      />,
    )
    const badges = screen.getAllByText('รอ Approve').filter((el) => el.tagName === 'SPAN')
    expect(badges.length).toBeGreaterThan(0)
    for (const badge of badges) expect(badge.className).toContain('whitespace-nowrap')
  })

  it('ACTIVE badge ("Active") also carries whitespace-nowrap', () => {
    render(
      <EmployeeManager
        users={[makeUser({ status: 'ACTIVE' })]}
        stats={{ total: 1, pending: 0, active: 1, disabled: 0, terminated: 0, rejected: 0 }}
        initialTab="all"
        canEditSalary={false}
      />,
    )
    const badges = screen.getAllByText('Active').filter((el) => el.tagName === 'SPAN')
    expect(badges.length).toBeGreaterThan(0)
    for (const badge of badges) expect(badge.className).toContain('whitespace-nowrap')
  })
})
