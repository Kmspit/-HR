// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import OutsideWorkStatusBadge from '@/app/(dashboard)/outside-work/OutsideWorkStatusBadge'

afterEach(() => cleanup())

/**
 * 2026-10-02 bug-scan round 2, finding #3: this badge sits in a plain <td>
 * with no width/nowrap at all (OutsideWorkExcelForm.tsx's dense Excel-style
 * grid — TD = 'border border-black align-top text-sm text-gray-900'), and
 * "รอ CEO อนุมัติ" (Thai+English mixed) is the longest label in its set.
 *
 * The <td> itself does NOT also need whitespace-nowrap — `white-space` is
 * set directly on this span (not inherited), so it governs the badge's own
 * wrap behavior regardless of what the surrounding cell does. The real
 * wrap-vs-no-wrap behavior was verified separately with a real headless-
 * Chromium render at a forced-narrow column width, reproducing both the
 * bug and the fix; jsdom here only checks the class is present.
 */
describe('OutsideWorkStatusBadge.tsx', () => {
  it('"รอ CEO อนุมัติ" (longest label in the set) carries whitespace-nowrap', () => {
    render(<OutsideWorkStatusBadge slot={{ approvalStatus: 'pending_ceo' }} />)
    const badge = screen.getByText('รอ CEO อนุมัติ')
    expect(badge.className).toContain('whitespace-nowrap')
  })

  it('short label ("อนุมัติ") also carries whitespace-nowrap', () => {
    render(<OutsideWorkStatusBadge slot={{ approvalStatus: 'APPROVED' }} />)
    const badge = screen.getByText('อนุมัติ')
    expect(badge.className).toContain('whitespace-nowrap')
  })
})
