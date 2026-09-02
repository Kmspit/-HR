import { describe, it, expect } from 'vitest'
import { formatLast4 } from '@/lib/last4-mask'

describe('formatLast4', () => {
  it('masks with 9 dots then the last 4 digits', () => {
    expect(formatLast4('1234')).toBe('•••••••••1234')
  })

  it('shows a placeholder when there is nothing to mask', () => {
    expect(formatLast4(null)).toBe('ยังไม่ได้กรอก')
    expect(formatLast4(undefined)).toBe('ยังไม่ได้กรอก')
    expect(formatLast4('')).toBe('ยังไม่ได้กรอก')
  })
})
