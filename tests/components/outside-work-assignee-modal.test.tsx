// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AssigneeCell } from '@/app/(dashboard)/outside-work/OutsideWorkExcelForm'

afterEach(() => cleanup())

const OPTIONS = Array.from({ length: 30 }, (_, i) => ({ id: `emp-${i}`, name: `พนักงาน ${i + 1}` }))

/**
 * Mobile audit fix (2026-09-22) — this modal's outer overlay had NO
 * overflow-y-auto at all (worse than the BiometricConsentModal bug this
 * mirrors), and the panel used max-h-[80vh] with no dvh fallback. On a real
 * mobile browser with visible toolbar chrome, vh overstates the actually
 * visible height, so the panel could render taller than what's visible with
 * zero way to scroll to the "ยกเลิก/ตกลง" buttons. Fix follows the exact
 * pattern BiometricConsentModal.tsx already uses successfully: outer overlay
 * scrolls (overflow-y-auto) as a safety net, panel lists both vh and dvh
 * (dvh wins the cascade where supported), inner list scrolls independently
 * via flex-1 min-h-0 overflow-y-auto so the footer buttons stay outside it.
 */
describe('OutsideWorkExcelForm AssigneeCell popover — scroll-reachable buttons on mobile', () => {
  it('outer overlay has overflow-y-auto (was completely missing before the fix)', () => {
    render(<AssigneeCell value={[]} options={OPTIONS} readOnly={false} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '+ ผู้รับผิดชอบ' }))

    const dialog = screen.getByRole('dialog', { name: 'เลือกพนักงานที่รับผิดชอบ' })
    const overlay = dialog.parentElement // the fixed inset-0 backdrop wrapping the panel
    expect(overlay?.className).toContain('overflow-y-auto')
  })

  it('panel lists both max-h-[80vh] (fallback) and max-h-[80dvh] (real visible-area fix), dvh listed after vh', () => {
    render(<AssigneeCell value={[]} options={OPTIONS} readOnly={false} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '+ ผู้รับผิดชอบ' }))

    const dialog = screen.getByRole('dialog', { name: 'เลือกพนักงานที่รับผิดชอบ' })
    const vhIndex = dialog.className.indexOf('max-h-[80vh]')
    const dvhIndex = dialog.className.indexOf('max-h-[80dvh]')
    expect(vhIndex).toBeGreaterThanOrEqual(0)
    expect(dvhIndex).toBeGreaterThan(vhIndex) // dvh must come after vh to win the CSS cascade
  })

  it('the "ยกเลิก"/"ตกลง" buttons are outside the inner scrollable list, not swallowed inside it', () => {
    render(<AssigneeCell value={[]} options={OPTIONS} readOnly={false} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '+ ผู้รับผิดชอบ' }))

    const cancelBtn = screen.getByRole('button', { name: 'ยกเลิก' })
    const confirmBtn = screen.getByRole('button', { name: 'ตกลง' })
    const dialog = screen.getByRole('dialog', { name: 'เลือกพนักงานที่รับผิดชอบ' })
    const scrollableList = dialog.querySelector('.overflow-y-auto.min-h-0')
    expect(scrollableList?.contains(cancelBtn)).toBe(false)
    expect(scrollableList?.contains(confirmBtn)).toBe(false)
  })

  it('clicking "ตกลง" still confirms the selection (behavior unchanged by the layout fix)', () => {
    const onChange = vi.fn()
    render(<AssigneeCell value={[]} options={OPTIONS} readOnly={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '+ ผู้รับผิดชอบ' }))
    fireEvent.click(screen.getByText('พนักงาน 3'))
    fireEvent.click(screen.getByRole('button', { name: 'ตกลง' }))
    expect(onChange).toHaveBeenCalledWith(['emp-2'])
  })
})
