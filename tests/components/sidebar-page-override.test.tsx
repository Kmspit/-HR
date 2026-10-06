// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

import Sidebar from '@/components/dashboard/Sidebar'

afterEach(() => cleanup())

function baseUser(role: string, pageOverrides?: { path: string; direction: 'GRANT' | 'RESTRICT' }[]) {
  return { name: 'ทดสอบ ระบบ', email: 'test@co.com', role: role as never, department: null, pageOverrides }
}

/**
 * 2026-10-02 per-user page-access override feature — Sidebar's nav filter
 * (components/dashboard/Sidebar.tsx) must respect a GRANT/RESTRICT override
 * on the 3 curated paths (lib/override-eligible-paths.ts), pre-fetched
 * server-side in app/(dashboard)/layout.tsx and passed in via user.pageOverrides
 * so this stays a synchronous render (no client fetch/useEffect).
 */
describe('Sidebar — per-user page-access override', () => {
  it('no pageOverrides prop at all: behaves exactly like before (role-only) — regression guard', () => {
    render(<Sidebar user={baseUser('EMPLOYEE')} />)
    expect(screen.queryAllByRole('link', { name: /^เงินเดือน$/ })).toHaveLength(0)
  })

  it('EMPLOYEE normally has no "เงินเดือน" (/payroll) link — a GRANT override makes it appear, linking to /payroll', () => {
    render(<Sidebar user={baseUser('EMPLOYEE', [{ path: '/payroll', direction: 'GRANT' }])} />)
    const links = screen.getAllByRole('link', { name: /^เงินเดือน$/ })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link.getAttribute('href')).toBe('/payroll')
  })

  it('MANAGER_HR normally has "เงินเดือน" (/payroll) — a RESTRICT override hides it', () => {
    render(<Sidebar user={baseUser('MANAGER_HR', [{ path: '/payroll', direction: 'RESTRICT' }])} />)
    expect(screen.queryAllByRole('link', { name: /^เงินเดือน$/ })).toHaveLength(0)
  })

  it('MANAGER_HR unaffected by an override on a different path (/reports GRANT does not touch /payroll)', () => {
    render(<Sidebar user={baseUser('MANAGER_HR', [{ path: '/reports', direction: 'GRANT' }])} />)
    expect(screen.getAllByRole('link', { name: /^เงินเดือน$/ }).length).toBeGreaterThan(0)
  })

  it('GRANT on /executive makes "CEO Command Center" appear for a non-exec role', () => {
    render(<Sidebar user={baseUser('MANAGER', [{ path: '/executive', direction: 'GRANT' }])} />)
    const links = screen.getAllByRole('link', { name: /CEO Command Center/ })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link.getAttribute('href')).toBe('/executive')
  })

  it('RESTRICT on /executive hides it even for CEO', () => {
    render(<Sidebar user={baseUser('CEO', [{ path: '/executive', direction: 'RESTRICT' }])} />)
    expect(screen.queryAllByRole('link', { name: /CEO Command Center/ })).toHaveLength(0)
  })
})
