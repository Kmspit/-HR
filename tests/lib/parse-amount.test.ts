import { describe, it, expect } from 'vitest'
import { parsePositiveAmount, parseNonNegativeNumber } from '@/lib/utils'

describe('parsePositiveAmount — money/quantity fields where 0 has no valid meaning (Phase A)', () => {
  it('accepts a positive number', () => {
    expect(parsePositiveAmount(500)).toBe(500)
    expect(parsePositiveAmount('500')).toBe(500)
    expect(parsePositiveAmount(0.5)).toBe(0.5)
  })

  it('rejects negative values — the exact bug class being fixed', () => {
    expect(parsePositiveAmount(-1)).toBeNull()
    expect(parsePositiveAmount('-500')).toBeNull()
    expect(parsePositiveAmount(-0.01)).toBeNull()
  })

  it('rejects zero', () => {
    expect(parsePositiveAmount(0)).toBeNull()
    expect(parsePositiveAmount('0')).toBeNull()
  })

  it('rejects non-numeric and non-finite input', () => {
    expect(parsePositiveAmount('abc')).toBeNull()
    expect(parsePositiveAmount(NaN)).toBeNull()
    expect(parsePositiveAmount(Infinity)).toBeNull()
    expect(parsePositiveAmount(null)).toBeNull()
    expect(parsePositiveAmount(undefined)).toBeNull()
    expect(parsePositiveAmount('')).toBeNull()
  })
})

describe('parseNonNegativeNumber — counts/distances where 0 is a legitimate value (Phase A)', () => {
  it('accepts zero, unlike parsePositiveAmount', () => {
    expect(parseNonNegativeNumber(0)).toBe(0)
    expect(parseNonNegativeNumber('0')).toBe(0)
  })

  it('accepts positive numbers', () => {
    expect(parseNonNegativeNumber(12)).toBe(12)
    expect(parseNonNegativeNumber('3.5')).toBe(3.5)
  })

  it('rejects negative values', () => {
    expect(parseNonNegativeNumber(-1)).toBeNull()
    expect(parseNonNegativeNumber('-1')).toBeNull()
  })

  it('rejects non-numeric and non-finite input', () => {
    expect(parseNonNegativeNumber('abc')).toBeNull()
    expect(parseNonNegativeNumber(NaN)).toBeNull()
    expect(parseNonNegativeNumber(Infinity)).toBeNull()
  })
})
