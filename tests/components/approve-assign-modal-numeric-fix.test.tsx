// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/client-api', () => ({
  apiJson: vi.fn().mockResolvedValue({ ok: true, data: { divisions: [], departments: [], sections: [], positions: [] }, status: 200 }),
  apiErrorMessage: vi.fn().mockReturnValue('error'),
}))

import ApproveAssignModal from '@/components/dashboard/ApproveAssignModal'

afterEach(() => cleanup())

/**
 * Mobile audit fix (2026-09-22, part E / group 6) — same reasoning as
 * NewAssignmentModal: baseSalary deliberately starts '' so the "25000"
 * placeholder shows, so this uses a direct type="text" + inputMode="decimal"
 * fix rather than the NumericInput component.
 */
describe('ApproveAssignModal — salary field mobile-keyboard fix', () => {
  it('renders type="text" with inputMode="decimal" (not type="number"), stays empty until typed, and rejects non-numeric input', async () => {
    render(
      <ApproveAssignModal userId="u1" userName="พนักงาน หนึ่ง" branchId="b1" canEditSalary onClose={vi.fn()} />,
    )

    const salaryInput = (await screen.findByLabelText('เงินเดือน *')) as HTMLInputElement
    expect(salaryInput.getAttribute('type')).toBe('text')
    expect(salaryInput.getAttribute('inputMode')).toBe('decimal')
    expect(salaryInput.value).toBe('')
    expect(salaryInput.getAttribute('placeholder')).toBe('25000')

    fireEvent.change(salaryInput, { target: { value: '42000' } })
    expect(salaryInput.value).toBe('42000')

    fireEvent.change(salaryInput, { target: { value: 'xyz' } })
    expect(salaryInput.value).toBe('42000')
  })
})
