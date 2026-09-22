// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('./NotificationBell', () => ({ default: () => null }))
vi.mock('@/components/dashboard/NotificationBell', () => ({ default: () => null }))
vi.mock('@/components/dashboard/UserMenu', () => ({ default: () => null }))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => null }))

import DashboardHeader from '@/components/dashboard/DashboardHeader'

afterEach(() => cleanup())

/**
 * Mobile audit fix (2026-09-22, part A) — the sticky top-0 header had no
 * safe-area-inset-top padding at all, so its content rendered flush against
 * the very top of the screen, under the phone's status bar/notch on devices
 * that report a safe-area inset (confirmed via a real screenshot). Mirrors
 * the pattern already used at the bottom edge in Sidebar.tsx. h-16 became
 * min-h-16 so the extra top padding grows the header instead of squeezing
 * its already vertically-centered content into a fixed height.
 */
describe('DashboardHeader — safe-area-inset-top fix', () => {
  it('has pt-[env(safe-area-inset-top,0px)] so content clears the status bar/notch', () => {
    render(<DashboardHeader user={{ name: 'A', email: 'a@test.com', role: 'HR', department: null }} />)
    const header = screen.getByRole('banner')
    expect(header.className).toContain('pt-[env(safe-area-inset-top,0px)]')
  })

  it('uses min-h-16 instead of a fixed h-16 (so the safe-area padding can grow the header, not squeeze its content)', () => {
    render(<DashboardHeader user={{ name: 'A', email: 'a@test.com', role: 'HR', department: null }} />)
    const header = screen.getByRole('banner')
    expect(header.className).toContain('min-h-16')
    expect(header.className).not.toMatch(/(?<!min-)\bh-16\b/)
  })

  it('still renders the mobile menu button and dispatches hrflow:open-sidebar on click (behavior unchanged)', () => {
    render(<DashboardHeader user={{ name: 'A', email: 'a@test.com', role: 'HR', department: null }} />)
    const listener = vi.fn()
    window.addEventListener('hrflow:open-sidebar', listener)
    screen.getByRole('button', { name: 'เปิดเมนู' }).click()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
