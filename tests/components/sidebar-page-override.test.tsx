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
 * on the curated path(s) in lib/override-eligible-paths.ts, pre-fetched
 * server-side in app/(dashboard)/layout.tsx and passed in via
 * user.pageOverrides so this stays a synchronous render (no client fetch/
 * useEffect).
 *
 * 2026-10-09 — only '/executive' remains curated (/payroll and /reports
 * temporarily removed, see lib/override-eligible-paths.ts's comment on the
 * branch-scoping gap that motivated it), so every scenario here uses
 * '/executive'. Note Sidebar itself does plain string matching on
 * item.href === o.path — it has no awareness of OVERRIDE_ELIGIBLE_PATHS and
 * would still honor a stray /payroll/reports override object if one were
 * ever passed in, but no real code path can produce one any more (the API
 * rejects creating overrides for non-curated paths).
 */
describe('Sidebar — per-user page-access override', () => {
  it('no pageOverrides prop at all: behaves exactly like before (role-only) — regression guard', () => {
    render(<Sidebar user={baseUser('MANAGER')} />)
    expect(screen.queryAllByRole('link', { name: /CEO Command Center/ })).toHaveLength(0)
  })

  it('MANAGER normally has no "CEO Command Center" (/executive) link — a GRANT override makes it appear, linking to /executive', () => {
    render(<Sidebar user={baseUser('MANAGER', [{ path: '/executive', direction: 'GRANT' }])} />)
    const links = screen.getAllByRole('link', { name: /CEO Command Center/ })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link.getAttribute('href')).toBe('/executive')
  })

  it('RESTRICT on /executive hides it even for CEO (normally allowed by default)', () => {
    render(<Sidebar user={baseUser('CEO', [{ path: '/executive', direction: 'RESTRICT' }])} />)
    expect(screen.queryAllByRole('link', { name: /CEO Command Center/ })).toHaveLength(0)
  })

  it('MANAGER unaffected by an override on an unrelated path (a stray /payroll GRANT, which no real flow can produce any more, does not touch /executive)', () => {
    render(<Sidebar user={baseUser('MANAGER', [{ path: '/payroll', direction: 'GRANT' }])} />)
    expect(screen.queryAllByRole('link', { name: /CEO Command Center/ })).toHaveLength(0)
  })
})
