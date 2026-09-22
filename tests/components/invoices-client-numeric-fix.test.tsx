// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

import InvoicesClient from '@/app/(dashboard)/invoices/InvoicesClient'

afterEach(() => cleanup())

const invoice = {
  id: 'inv-1', invoiceNumber: 'INV-001', clientName: 'บริษัท ทดสอบ จำกัด',
  serviceType: 'เร่งรัดหนี้สิน', lineItems: '[]',
  subtotal: 1000, vatRate: 0.07, vatAmount: 70,
  whtRate: 0, whtAmount: 0, totalAmount: 1070,
  status: 'SENT', issueDate: '2026-09-01', dueDate: '2026-10-01',
  paidAmount: 0, remainingAmount: 1070,
  createdBy: { id: 'u1', name: 'ผู้สร้าง', role: 'HR', department: null },
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  payments: [], receipts: [],
}

function mockFetch(withInvoices: boolean) {
  return vi.fn((url: string) => {
    if (url.startsWith('/api/invoices?')) {
      return Promise.resolve({ ok: true, json: async () => ({ items: withInvoices ? [invoice] : [], total: withInvoices ? 1 : 0 }) })
    }
    if (url === '/api/invoices/inv-1') {
      return Promise.resolve({ ok: true, json: async () => invoice })
    }
    if (url.startsWith('/api/client-companies')) {
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  }) as unknown as typeof fetch
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch(false))
})

/**
 * Mobile audit fix (2026-09-22, part E / group 6) — three number-typed fields
 * in this file: payment "amount" and line-item "qty" go through the new
 * NumericInput component (both always hold a real prefilled number, never an
 * intentional empty-placeholder state), while line-item "unitPrice" keeps a
 * direct type="text" + inputMode="decimal" fix since it deliberately starts
 * '' so the "ราคา" placeholder shows.
 */
describe('InvoicesClient — numeric field mobile-keyboard fixes', () => {
  it('create-invoice modal: qty uses NumericInput (inputMode=numeric), unitPrice uses a direct text+decimal fix', async () => {
    render(<InvoicesClient userId="u1" userRole="HR" />)

    fireEvent.click(await screen.findByRole('button', { name: '+ สร้างใบแจ้งหนี้' }))

    const qtyInput = (await screen.findByPlaceholderText('จำนวน')) as HTMLInputElement
    expect(qtyInput.getAttribute('type')).toBe('text')
    expect(qtyInput.getAttribute('inputMode')).toBe('numeric')
    expect(qtyInput.value).toBe('1')

    const priceInput = screen.getByPlaceholderText('ราคา') as HTMLInputElement
    expect(priceInput.getAttribute('type')).toBe('text')
    expect(priceInput.getAttribute('inputMode')).toBe('decimal')
    expect(priceInput.value).toBe('')

    fireEvent.change(priceInput, { target: { value: '99.5' } })
    expect(priceInput.value).toBe('99.5')
    fireEvent.change(priceInput, { target: { value: 'abc' } })
    expect(priceInput.value).toBe('99.5')
  })

  it('payments tab: amount field uses NumericInput (inputMode=decimal), prefilled from remainingAmount', async () => {
    vi.stubGlobal('fetch', mockFetch(true))
    render(<InvoicesClient userId="u1" userRole="HR" />)

    fireEvent.click(await screen.findByText('บริษัท ทดสอบ จำกัด'))
    fireEvent.click(await screen.findByRole('button', { name: 'บันทึกการรับชำระ' }))
    fireEvent.click(await screen.findByRole('button', { name: '+ บันทึกการรับชำระ' }))

    const amountInput = (await screen.findByLabelText('จำนวนเงิน (บาท) *')) as HTMLInputElement
    expect(amountInput.getAttribute('type')).toBe('text')
    expect(amountInput.getAttribute('inputMode')).toBe('decimal')
    expect(amountInput.value).toBe('1070')
  })
})
