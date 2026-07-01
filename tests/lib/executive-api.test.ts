import { describe, expect, it } from 'vitest'
import { canAccessExecutiveApi } from '@/lib/executive-api'

describe('canAccessExecutiveApi', () => {
  it('allows CEO and SUPER_ADMIN only', () => {
    expect(canAccessExecutiveApi('CEO')).toBe(true)
    expect(canAccessExecutiveApi('SUPER_ADMIN')).toBe(true)
  })

  it('blocks MANAGER and HR', () => {
    expect(canAccessExecutiveApi('MANAGER')).toBe(false)
    expect(canAccessExecutiveApi('HR')).toBe(false)
    expect(canAccessExecutiveApi('MANAGER_HR')).toBe(false)
  })
})
