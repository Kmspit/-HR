// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/client-api', () => ({
  apiJson: vi.fn().mockResolvedValue({ ok: true, data: { divisions: [], departments: [], sections: [], positions: [] }, status: 200 }),
  apiErrorMessage: vi.fn().mockReturnValue('error'),
}))

import NewAssignmentModal from '@/components/employees/NewAssignmentModal'

afterEach(() => cleanup())

/**
 * Mobile audit fix (2026-09-22, part E / group 6) — the salary field used
 * type="number" (full alphanumeric keyboard on some mobile browsers, and a
 * scroll-wheel-changes-value footgun). Fixed with type="text" +
 * inputMode="decimal" directly (NOT the new NumericInput component) — this
 * field deliberately starts '' rather than 0 so its placeholder hint shows;
 * routing it through NumericInput's number-typed contract would collapse
 * that empty state into a literal displayed "0".
 */
describe('NewAssignmentModal — salary field mobile-keyboard fix', () => {
  it('renders type="text" with inputMode="decimal" (not type="number"), scoped to money-only input, and stays empty until typed (placeholder still applies)', async () => {
    render(
      <NewAssignmentModal
        userId="u1" userName="พนักงาน หนึ่ง" branchId="b1" canEditSalary
        currentAssignment={null} isTerminated={false} onClose={vi.fn()} onSaved={vi.fn()}
      />,
    )

    fireEvent.change(await screen.findByLabelText('ประเภทการเปลี่ยนแปลง *'), { target: { value: 'PROMOTION' } })

    const salaryInput = screen.getByLabelText('เงินเดือน *') as HTMLInputElement
    expect(salaryInput.getAttribute('type')).toBe('text')
    expect(salaryInput.getAttribute('inputMode')).toBe('decimal')
    expect(salaryInput.value).toBe('') // still empty — placeholder-driven UX preserved

    fireEvent.change(salaryInput, { target: { value: '35000' } })
    expect(salaryInput.value).toBe('35000')

    fireEvent.change(salaryInput, { target: { value: 'abc' } })
    expect(salaryInput.value).toBe('35000') // non-numeric keystroke rejected
  })
})
