import { describe, it, expect } from 'vitest'
import { BLOOD_TYPE_OPTIONS, isValidBloodType, bloodTypeLabel } from '@/lib/blood-type'

describe('isValidBloodType', () => {
  it('accepts every option value', () => {
    for (const o of BLOOD_TYPE_OPTIONS) expect(isValidBloodType(o.value)).toBe(true)
  })

  it('rejects an unknown value', () => {
    expect(isValidBloodType('X')).toBe(false)
    expect(isValidBloodType('')).toBe(false)
  })
})

describe('bloodTypeLabel', () => {
  it('returns the Thai label for a known value', () => {
    expect(bloodTypeLabel('A')).toBe('A')
    expect(bloodTypeLabel('UNKNOWN')).toBe('ไม่ทราบ')
  })

  it('returns an em dash for null/undefined/empty', () => {
    expect(bloodTypeLabel(null)).toBe('—')
    expect(bloodTypeLabel(undefined)).toBe('—')
  })

  it('falls back to the raw value for an unrecognized one', () => {
    expect(bloodTypeLabel('X')).toBe('X')
  })
})
