import { describe, it, expect } from 'vitest'
import { assertNoStrayProdCreds, hasProdCreds, isProductionRuntime } from '@/lib/prod-guard'
import * as scriptGuard from '@/scripts/lib/prod-guard.mjs'

const TURSO = { TURSO_DATABASE_URL: 'libsql://x.turso.io', TURSO_AUTH_TOKEN: 't' }

describe('lib/prod-guard', () => {
  it('no TURSO_* → passes in any NODE_ENV', () => {
    expect(() => assertNoStrayProdCreds('t', { NODE_ENV: 'development' })).not.toThrow()
    expect(() => assertNoStrayProdCreds('t', { NODE_ENV: 'test', TURSO_DATABASE_URL: '' })).not.toThrow()
  })

  it('TURSO_* outside production → throws', () => {
    for (const NODE_ENV of ['development', 'test', undefined]) {
      expect(() => assertNoStrayProdCreds('t', { ...TURSO, NODE_ENV })).toThrow(/prod-guard/)
    }
    // either key alone is enough to trip it
    expect(() => assertNoStrayProdCreds('t', { TURSO_AUTH_TOKEN: 't' })).toThrow()
  })

  it('ALLOW_PROD=1 opts in; any other value does not', () => {
    expect(() => assertNoStrayProdCreds('t', { ...TURSO, ALLOW_PROD: '1' })).not.toThrow()
    expect(() => assertNoStrayProdCreds('t', { ...TURSO, ALLOW_PROD: 'true' })).toThrow()
  })

  it('production runtime (NODE_ENV or Vercel production/preview) → passes', () => {
    expect(() => assertNoStrayProdCreds('t', { ...TURSO, NODE_ENV: 'production' })).not.toThrow()
    expect(() => assertNoStrayProdCreds('t', { ...TURSO, VERCEL_ENV: 'production' })).not.toThrow()
    expect(() => assertNoStrayProdCreds('t', { ...TURSO, VERCEL_ENV: 'preview' })).not.toThrow()
    // `vercel env pull` writes VERCEL_ENV="development" — must NOT count as production
    expect(isProductionRuntime({ VERCEL_ENV: 'development' })).toBe(false)
    expect(() => assertNoStrayProdCreds('t', { ...TURSO, VERCEL_ENV: 'development' })).toThrow()
  })

  it('whitespace-only values do not count as creds', () => {
    expect(hasProdCreds({ TURSO_DATABASE_URL: '  ', TURSO_AUTH_TOKEN: '' })).toBe(false)
  })
})

describe('scripts/lib/prod-guard.mjs stays in sync with lib/prod-guard.ts', () => {
  const cases: Record<string, string | undefined>[] = [
    {},
    { ...TURSO },
    { ...TURSO, NODE_ENV: 'production' },
    { ...TURSO, VERCEL_ENV: 'preview' },
    { ...TURSO, VERCEL_ENV: 'development' },
    { ...TURSO, ALLOW_PROD: '1' },
    { TURSO_AUTH_TOKEN: ' ' },
  ]
  it.each(cases)('same verdict for %o', (env) => {
    const a = (() => { try { assertNoStrayProdCreds('t', env); return 'ok' } catch { return 'throw' } })()
    const b = (() => { try { scriptGuard.assertNoStrayProdCreds('t', env); return 'ok' } catch { return 'throw' } })()
    expect(b).toBe(a)
  })

  it('--prod is required to target production', () => {
    expect(scriptGuard.wantsProd(['node', 'x.mjs', '--dry-run'])).toBe(false)
    expect(scriptGuard.wantsProd(['node', 'x.mjs', '--prod'])).toBe(true)
  })
})
