// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/client-api', () => ({
  apiJson: vi.fn(),
  apiErrorMessage: (data: Record<string, unknown>, fallback: string) =>
    (typeof data?.error === 'string' && data.error) || fallback,
}))

import HolidaysClient from '@/app/(dashboard)/holidays/HolidaysClient'

afterEach(() => cleanup())

const baseHoliday = {
  id: 'h1', holidayName: 'ทดสอบ', holidayDate: '2026-12-25T00:00:00.000Z',
  repeatEveryYear: false, branchId: null, branchLabel: 'ทุกสาขา',
}

/**
 * 2026-10-02 bug-scan round 2, finding #4: confirmed this IS a real colored
 * badge (TYPE_BADGE supplies bg- / text- color classes), not plain text in a
 * plain <td> — so the same whitespace-nowrap fix applies, consistent with
 * every other badge fixed in this round. "วันหยุดนักขัตฤกษ์" is more than
 * 2x longer than the shortest label ("วันเสาร์") in the same column.
 *
 * jsdom has no real layout engine, so this asserts the fix at the only
 * level jsdom can verify (the class is present) — the real wrap-vs-no-wrap
 * behavior was verified separately with a real headless-Chromium render at
 * a forced-narrow column width, reproducing both the bug and the fix.
 */
describe('HolidaysClient.tsx TYPE_BADGE span — confirmed a real colored badge, not plain text', () => {
  it('"วันหยุดนักขัตฤกษ์" (longest label, >2x the shortest) carries whitespace-nowrap', () => {
    render(
      <HolidaysClient
        initialHolidays={[{ ...baseHoliday, holidayType: 'PUBLIC_HOLIDAY' }]}
        branches={[]}
      />,
    )
    // The same label text also appears in <option> elements (type filter +
    // the add/edit form's select) — scope to the actual badge <span>.
    const badge = screen.getAllByText('วันหยุดนักขัตฤกษ์').find((el) => el.tagName === 'SPAN')
    expect(badge).toBeTruthy()
    expect(badge!.className).toContain('whitespace-nowrap')
  })

  it('shortest label ("วันเสาร์") also carries whitespace-nowrap', () => {
    render(
      <HolidaysClient
        initialHolidays={[{ ...baseHoliday, holidayType: 'SATURDAY' }]}
        branches={[]}
      />,
    )
    const badge = screen.getAllByText('วันเสาร์').find((el) => el.tagName === 'SPAN')
    expect(badge).toBeTruthy()
    expect(badge!.className).toContain('whitespace-nowrap')
  })
})
