import { describe, it, expect } from 'vitest'
import { EDUCATION_LEVEL_OPTIONS, isValidEducationLevel, educationLevelLabel } from '@/lib/education-level'

describe('isValidEducationLevel', () => {
  it('accepts every option value', () => {
    for (const o of EDUCATION_LEVEL_OPTIONS) expect(isValidEducationLevel(o.value)).toBe(true)
  })

  it('rejects an unknown value', () => {
    expect(isValidEducationLevel('PHD')).toBe(false)
    expect(isValidEducationLevel('')).toBe(false)
  })
})

describe('educationLevelLabel', () => {
  it('returns the Thai label for a known value', () => {
    expect(educationLevelLabel('BACHELOR')).toBe('ปริญญาตรี')
    expect(educationLevelLabel('VOCATIONAL_CERT')).toBe('ปวช.')
  })

  it('returns an em dash for null/undefined/empty', () => {
    expect(educationLevelLabel(null)).toBe('—')
    expect(educationLevelLabel(undefined)).toBe('—')
  })

  it('falls back to the raw value for an unrecognized one', () => {
    expect(educationLevelLabel('PHD')).toBe('PHD')
  })
})
