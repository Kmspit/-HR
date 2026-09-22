// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import AttendanceDetailModal from '@/components/attendance/AttendanceDetailModal'

afterEach(() => cleanup())

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      id: 'rec-1', date: '2026-09-22', sessionIndex: 0, checkIn: null, checkOut: null,
      lunchOut: null, lunchIn: null, status: 'NORMAL', lateMinutes: 0, earlyLeaveMinutes: 0,
      isOutside: false, workPlaceName: null, address: null,
      checkInLat: null, checkInLng: null, checkInAddress: null,
      checkOutLat: null, checkOutLng: null, checkOutAddress: null,
      autoCheckout: false, note: null, gpsAccuracy: null,
      photoUrl: null, checkOutPhotoUrl: null, lunchOutPhotoUrl: null, lunchInPhotoUrl: null,
      user: { name: 'พนักงาน ทดสอบ', department: null, employeeId: null },
      branch: null, outsideWork: null,
    }),
  }))
})

/**
 * Mobile audit fixes (2026-09-22):
 * - Part C (group 4): panel's dvh sizing regressed to plain vh once the md
 *   breakpoint (768px) kicked in — fixed by listing md:max-h-[88dvh] after
 *   md:max-h-[88vh] so it wins the cascade where supported.
 * - Part D (group 5): footer close-button bar used a plain pb-5, letting it
 *   crowd or sit under the iPhone home-indicator/Android gesture bar on the
 *   mobile bottom-sheet layout — fixed with env(safe-area-inset-bottom).
 */
describe('AttendanceDetailModal — mobile layout fixes', () => {
  it('panel lists md:max-h-[88vh] (fallback) and md:max-h-[88dvh] (fix), dvh listed after vh', async () => {
    render(<AttendanceDetailModal recordId="rec-1" onClose={vi.fn()} />)
    const dialog = await screen.findByRole('dialog', { name: 'รายละเอียดการลงเวลา' })
    const panel = dialog.querySelector('.flex.flex-col') as HTMLElement
    const vhIndex = panel.className.indexOf('md:max-h-[88vh]')
    const dvhIndex = panel.className.indexOf('md:max-h-[88dvh]')
    expect(vhIndex).toBeGreaterThanOrEqual(0)
    expect(dvhIndex).toBeGreaterThan(vhIndex)
  })

  it('footer "ปิด" button bar uses pb-[max(env(safe-area-inset-bottom),1.25rem)], not a plain pb-5', async () => {
    render(<AttendanceDetailModal recordId="rec-1" onClose={vi.fn()} />)
    // "ปิด" matches both the header icon-close button (aria-label="ปิด") and
    // the footer's full-width text button — the footer one is the last of
    // the two in DOM order.
    const closeBtns = await screen.findAllByRole('button', { name: 'ปิด' })
    const footerCloseBtn = closeBtns[closeBtns.length - 1]
    const footer = footerCloseBtn.parentElement
    expect(footer?.className).toContain('pb-[max(env(safe-area-inset-bottom),1.25rem)]')
    expect(footer?.className).not.toMatch(/\bpb-5\b/)
  })
})
