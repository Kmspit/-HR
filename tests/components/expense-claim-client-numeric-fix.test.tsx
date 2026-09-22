// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

import ExpenseClaimClient from '@/app/(dashboard)/expense-claim/ExpenseClaimClient'

afterEach(() => cleanup())

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ items: [] }) })) as unknown as typeof fetch)
})

/**
 * Mobile audit fix (2026-09-22, part E / group 6) — amount field deliberately
 * starts '' (from `empty`) so the "0.00" placeholder shows; fixed with a
 * direct type="text" + inputMode="decimal" fix (not NumericInput) for the
 * same reason as the other placeholder-driven money fields in this session.
 */
describe('ExpenseClaimClient — amount field mobile-keyboard fix', () => {
  it('renders type="text" with inputMode="decimal" (not type="number"), stays empty until typed, and rejects non-numeric input', async () => {
    render(<ExpenseClaimClient userId="u1" userRole="EMPLOYEE" userName="พนักงาน หนึ่ง" />)

    fireEvent.click(await screen.findByRole('button', { name: '➕ ยื่นเบิกใหม่' }))

    const amountInput = (await screen.findByLabelText('จำนวนเงิน (บาท) *')) as HTMLInputElement
    expect(amountInput.getAttribute('type')).toBe('text')
    expect(amountInput.getAttribute('inputMode')).toBe('decimal')
    expect(amountInput.value).toBe('')
    expect(amountInput.getAttribute('placeholder')).toBe('0.00')

    fireEvent.change(amountInput, { target: { value: '1500.50' } })
    expect(amountInput.value).toBe('1500.50')

    fireEvent.change(amountInput, { target: { value: 'abc' } })
    expect(amountInput.value).toBe('1500.50')
  })
})
