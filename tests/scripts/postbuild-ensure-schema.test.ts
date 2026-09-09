import { describe, it, expect } from 'vitest'
import { shouldRunSchemaSync } from '@/scripts/postbuild-ensure-schema'

describe('shouldRunSchemaSync — auto-detects the main branch via VERCEL_GIT_COMMIT_REF', () => {
  it('returns false when VERCEL_GIT_COMMIT_REF is missing entirely', () => {
    expect(shouldRunSchemaSync({})).toBe(false)
  })

  it('returns false when the value is an empty string', () => {
    expect(shouldRunSchemaSync({ VERCEL_GIT_COMMIT_REF: '' })).toBe(false)
  })

  it('returns false for a different branch name', () => {
    expect(shouldRunSchemaSync({ VERCEL_GIT_COMMIT_REF: 'feature/biometric-consent' })).toBe(false)
    expect(shouldRunSchemaSync({ VERCEL_GIT_COMMIT_REF: 'test/prep-wipe-purge-script' })).toBe(false)
  })

  it('returns false for "Main" / "MAIN" (wrong case — comparison is case-sensitive)', () => {
    expect(shouldRunSchemaSync({ VERCEL_GIT_COMMIT_REF: 'Main' })).toBe(false)
    expect(shouldRunSchemaSync({ VERCEL_GIT_COMMIT_REF: 'MAIN' })).toBe(false)
  })

  it('returns false for " main" / "main " (whitespace — not an exact match)', () => {
    expect(shouldRunSchemaSync({ VERCEL_GIT_COMMIT_REF: ' main' })).toBe(false)
    expect(shouldRunSchemaSync({ VERCEL_GIT_COMMIT_REF: 'main ' })).toBe(false)
  })

  it('returns false for a ref-style value ("refs/heads/main"), only the bare branch name counts', () => {
    expect(shouldRunSchemaSync({ VERCEL_GIT_COMMIT_REF: 'refs/heads/main' })).toBe(false)
  })

  it('never keys off VERCEL_ENV — present or absent, it has no effect', () => {
    expect(shouldRunSchemaSync({ VERCEL_ENV: 'production' })).toBe(false)
    expect(shouldRunSchemaSync({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(shouldRunSchemaSync({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' })).toBe(true)
  })

  it('returns true only for the exact string "main"', () => {
    expect(shouldRunSchemaSync({ VERCEL_GIT_COMMIT_REF: 'main' })).toBe(true)
  })
})
