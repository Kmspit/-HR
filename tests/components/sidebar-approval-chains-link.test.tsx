// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

import Sidebar from '@/components/dashboard/Sidebar'

afterEach(() => cleanup())

function baseUser(role: string) {
  return { name: 'ทดสอบ ระบบ', email: 'test@co.com', role: role as never, department: null }
}

/**
 * The Approval Chain page (/settings/approval-chains, gated server-side by
 * canManageUsers) had zero sidebar entry anywhere — HR could never find it
 * without knowing the URL by heart. Fixed 2026-09-30 by adding a "สายอนุมัติ"
 * item to the "บุคคล & HR" section, gated by the same HR_ADMIN role array
 * every other canManageUsers-equivalent-gated item in that section already
 * uses (e.g. /branches, /organization) — the sidebar's filter is a plain
 * roles.includes() check with no permission-function support, so HR_ADMIN
 * is the established way to approximate canManageUsers here.
 */
describe('Sidebar — Approval Chain menu link', () => {
  it('shows "สายอนุมัติ" linking to /settings/approval-chains for an HR_ADMIN role (MANAGER_HR)', () => {
    render(<Sidebar user={baseUser('MANAGER_HR')} />)
    const links = screen.getAllByRole('link', { name: /สายอนุมัติ/ })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('/settings/approval-chains')
    }
  })

  it('shows it for every HR_ADMIN role (SUPER_ADMIN, CEO, HR, ADMIN)', () => {
    for (const role of ['SUPER_ADMIN', 'CEO', 'HR', 'ADMIN']) {
      cleanup()
      render(<Sidebar user={baseUser(role)} />)
      expect(screen.getAllByRole('link', { name: /สายอนุมัติ/ }).length).toBeGreaterThan(0)
    }
  })

  it('hides it for a plain EMPLOYEE (not HR_ADMIN) — same population the page itself redirects away', () => {
    render(<Sidebar user={baseUser('EMPLOYEE')} />)
    expect(screen.queryAllByRole('link', { name: /สายอนุมัติ/ })).toHaveLength(0)
  })

  it('hides it for MANAGER and LAWYER (can approve some things, but not canManageUsers)', () => {
    for (const role of ['MANAGER', 'LAWYER']) {
      cleanup()
      render(<Sidebar user={baseUser(role)} />)
      expect(screen.queryAllByRole('link', { name: /สายอนุมัติ/ })).toHaveLength(0)
    }
  })
})
