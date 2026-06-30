import { describe, it, expect } from 'vitest'
import { isEnglishOnly, englishOnlyFieldError, ENGLISH_ONLY_ERROR } from '@/lib/english-input'

describe('english-input', () => {
  it('accepts ASCII email and password characters', () => {
    expect(isEnglishOnly('user@company.com')).toBe(true)
    expect(isEnglishOnly('Demo1234!')).toBe(true)
    expect(isEnglishOnly('EMP001')).toBe(true)
  })

  it('rejects Thai and other non-ASCII characters', () => {
    expect(isEnglishOnly('ทดสอบ@test.com')).toBe(false)
    expect(isEnglishOnly('passวord')).toBe(false)
  })

  it('returns error message only for non-empty invalid values', () => {
    expect(englishOnlyFieldError('')).toBeUndefined()
    expect(englishOnlyFieldError('ok@x.com')).toBeUndefined()
    expect(englishOnlyFieldError('ไทย')).toBe(ENGLISH_ONLY_ERROR)
  })
})
