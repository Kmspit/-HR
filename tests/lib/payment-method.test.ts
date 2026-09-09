import { describe, it, expect } from 'vitest'
import { PAYMENT_METHOD_OPTIONS, isValidPaymentMethod, paymentMethodLabel } from '@/lib/payment-method'

describe('PAYMENT_METHOD_OPTIONS', () => {
  it('has exactly the 3 methods from the PaymentMethod enum', () => {
    expect(PAYMENT_METHOD_OPTIONS.map((o) => o.value)).toEqual(['BANK_TRANSFER', 'CASH', 'CHEQUE'])
  })

  it('every option has a non-empty Thai label', () => {
    for (const o of PAYMENT_METHOD_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0)
    }
  })
})

describe('isValidPaymentMethod', () => {
  it('accepts every real enum value', () => {
    expect(isValidPaymentMethod('BANK_TRANSFER')).toBe(true)
    expect(isValidPaymentMethod('CASH')).toBe(true)
    expect(isValidPaymentMethod('CHEQUE')).toBe(true)
  })

  it('rejects an unrecognized value', () => {
    expect(isValidPaymentMethod('BITCOIN')).toBe(false)
  })

  it('rejects an empty string — blank is "not provided", handled separately by callers', () => {
    expect(isValidPaymentMethod('')).toBe(false)
  })

  it('is case-sensitive — lowercase is not a match', () => {
    expect(isValidPaymentMethod('cash')).toBe(false)
  })
})

describe('paymentMethodLabel', () => {
  it('returns the Thai label for a known value', () => {
    expect(paymentMethodLabel('BANK_TRANSFER')).toBe('โอนเข้าบัญชี')
    expect(paymentMethodLabel('CASH')).toBe('เงินสด')
    expect(paymentMethodLabel('CHEQUE')).toBe('เช็ค')
  })

  it('returns a placeholder dash for null/undefined/blank', () => {
    expect(paymentMethodLabel(null)).toBe('—')
    expect(paymentMethodLabel(undefined)).toBe('—')
    expect(paymentMethodLabel('')).toBe('—')
  })

  it('falls back to the raw value for an unrecognized string rather than crashing', () => {
    expect(paymentMethodLabel('SOMETHING_ELSE')).toBe('SOMETHING_ELSE')
  })
})
