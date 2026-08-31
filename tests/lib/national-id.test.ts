import { describe, it, expect } from 'vitest'
import { maskNationalId, nationalIdFingerprint } from '@/lib/national-id'

describe('maskNationalId — never throws, reveals at most the last digit', () => {
  it('masks a valid 13-digit id, keeping only the last digit', () => {
    expect(maskNationalId('1234567890123')).toEqual({
      status: 'MASKED',
      display: 'x-xxxx-xxxxx-xx-3',
    })
  })

  it('strips non-digit formatting before masking', () => {
    expect(maskNationalId('1-2345-67890-12-3')).toEqual({
      status: 'MASKED',
      display: 'x-xxxx-xxxxx-xx-3',
    })
  })

  it('reports MISSING for null/undefined/empty — distinct from a bad value', () => {
    expect(maskNationalId(null)).toEqual({ status: 'MISSING', display: 'ยังไม่ได้กรอก' })
    expect(maskNationalId(undefined)).toEqual({ status: 'MISSING', display: 'ยังไม่ได้กรอก' })
    expect(maskNationalId('')).toEqual({ status: 'MISSING', display: 'ยังไม่ได้กรอก' })
    expect(maskNationalId('   ')).toEqual({ status: 'MISSING', display: 'ยังไม่ได้กรอก' })
  })

  it('reports INVALID when digits present but count != 13', () => {
    expect(maskNationalId('123')).toEqual({ status: 'INVALID', display: 'ข้อมูลไม่ถูกต้อง' })
    expect(maskNationalId('123456789012')).toEqual({ status: 'INVALID', display: 'ข้อมูลไม่ถูกต้อง' })
    expect(maskNationalId('12345678901234')).toEqual({ status: 'INVALID', display: 'ข้อมูลไม่ถูกต้อง' })
  })

  it('never throws on garbage input, reports INVALID', () => {
    expect(() => maskNationalId('not-a-number')).not.toThrow()
    expect(maskNationalId('not-a-number')).toEqual({ status: 'INVALID', display: 'ข้อมูลไม่ถูกต้อง' })
  })
})

describe('nationalIdFingerprint — distinguishes values that mask identically', () => {
  it('two ids sharing a last digit produce the same masked display but different fingerprints', () => {
    const a = '1234567890123'
    const b = '9999999999993'
    expect(maskNationalId(a).display).toBe(maskNationalId(b).display) // both end in 3
    expect(nationalIdFingerprint(a)).not.toBe(nationalIdFingerprint(b))
  })

  it('is stable for the same digits regardless of formatting', () => {
    expect(nationalIdFingerprint('1234567890123')).toBe(nationalIdFingerprint('1-2345-67890-12-3'))
  })

  it('returns null for blank/null/undefined — never a fingerprint of nothing', () => {
    expect(nationalIdFingerprint(null)).toBeNull()
    expect(nationalIdFingerprint(undefined)).toBeNull()
    expect(nationalIdFingerprint('')).toBeNull()
  })

  it('never reveals the original digits in its output', () => {
    const fp = nationalIdFingerprint('1234567890123')
    expect(fp).not.toContain('1234567890123')
    expect(fp).toMatch(/^[0-9a-f]{12}$/)
  })
})
