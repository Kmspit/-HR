import { describe, it, expect } from 'vitest'
import { shouldRunSchemaSync } from '@/scripts/postbuild-ensure-schema'

describe('shouldRunSchemaSync — explicit opt-in gate for the postbuild schema sync', () => {
  it('returns false when ALLOW_PROD_SCHEMA_APPLY is missing entirely', () => {
    expect(shouldRunSchemaSync({})).toBe(false)
  })

  it('returns false when the value is an empty string', () => {
    expect(shouldRunSchemaSync({ ALLOW_PROD_SCHEMA_APPLY: '' })).toBe(false)
  })

  it('returns false for "false"', () => {
    expect(shouldRunSchemaSync({ ALLOW_PROD_SCHEMA_APPLY: 'false' })).toBe(false)
  })

  it('returns false for "1" (not the exact string "true")', () => {
    expect(shouldRunSchemaSync({ ALLOW_PROD_SCHEMA_APPLY: '1' })).toBe(false)
  })

  it('returns false for "TRUE" (wrong case — comparison is case-sensitive)', () => {
    expect(shouldRunSchemaSync({ ALLOW_PROD_SCHEMA_APPLY: 'TRUE' })).toBe(false)
  })

  it('returns false for "True" (wrong case)', () => {
    expect(shouldRunSchemaSync({ ALLOW_PROD_SCHEMA_APPLY: 'True' })).toBe(false)
  })

  it('returns false for " true" / "true " (whitespace — not an exact match)', () => {
    expect(shouldRunSchemaSync({ ALLOW_PROD_SCHEMA_APPLY: ' true' })).toBe(false)
    expect(shouldRunSchemaSync({ ALLOW_PROD_SCHEMA_APPLY: 'true ' })).toBe(false)
  })

  it('returns false for any unrelated truthy-looking value ("yes", "on")', () => {
    expect(shouldRunSchemaSync({ ALLOW_PROD_SCHEMA_APPLY: 'yes' })).toBe(false)
    expect(shouldRunSchemaSync({ ALLOW_PROD_SCHEMA_APPLY: 'on' })).toBe(false)
  })

  it('never keys off VERCEL_ENV — present or absent, it has no effect', () => {
    expect(shouldRunSchemaSync({ VERCEL_ENV: 'production' })).toBe(false)
    expect(shouldRunSchemaSync({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(shouldRunSchemaSync({ VERCEL_ENV: 'production', ALLOW_PROD_SCHEMA_APPLY: 'true' })).toBe(true)
  })

  it('returns true only for the exact string "true"', () => {
    expect(shouldRunSchemaSync({ ALLOW_PROD_SCHEMA_APPLY: 'true' })).toBe(true)
  })
})
