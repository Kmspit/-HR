import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockLimit = vi.fn()
// vi.fn()'s default mock implementation is an arrow function, which can't be
// invoked with `new` — use a real function expression instead so `new Redis(...)`
// / `new Ratelimit(...)` work, while still recording calls via vi.fn() spies.
const RedisCtor = vi.fn(function (this: unknown) { return {} } as unknown as (opts: unknown) => object)
vi.mock('@upstash/redis', () => ({ Redis: RedisCtor }))

const RatelimitCtor = vi.fn(function (this: unknown) {
  return { limit: mockLimit }
} as unknown as (opts: unknown) => { limit: typeof mockLimit })
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(RatelimitCtor, {
    fixedWindow: vi.fn().mockReturnValue('fixed-window-config'),
  }),
}))

const ORIGINAL_ENV = { ...process.env }

describe('rateLimit — falls back to in-memory without Upstash, uses Upstash when configured', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env = { ...ORIGINAL_ENV }
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('uses the in-memory counter when Upstash env vars are absent, never touching Redis', async () => {
    const { rateLimit } = await import('@/lib/rate-limit')
    const key = `mem-key-${Math.random()}`

    for (let i = 0; i < 3; i++) {
      const r = await rateLimit(key, 3, 60_000)
      expect(r.allowed).toBe(true)
    }
    const blocked = await rateLimit(key, 3, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(RedisCtor).not.toHaveBeenCalled()
  })

  it('delegates to Upstash Ratelimit when env vars are configured', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mockLimit.mockResolvedValue({ success: true, remaining: 4, reset: 123456 })

    const { rateLimit } = await import('@/lib/rate-limit')
    const result = await rateLimit('acct-key', 5, 60_000)

    expect(result).toEqual({ allowed: true, remaining: 4, resetAt: 123456 })
    expect(RedisCtor).toHaveBeenCalledWith({ url: 'https://example.upstash.io', token: 'test-token' })
    expect(mockLimit).toHaveBeenCalledWith('acct-key')
  })

  it('reflects a denied Upstash result as allowed:false', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mockLimit.mockResolvedValue({ success: false, remaining: 0, reset: 999 })

    const { rateLimit } = await import('@/lib/rate-limit')
    const result = await rateLimit('acct-key-2', 5, 60_000)

    expect(result).toEqual({ allowed: false, remaining: 0, resetAt: 999 })
  })

  it('fails open to the in-memory counter if the Upstash request throws, instead of taking the endpoint down', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mockLimit.mockRejectedValue(new Error('network error'))

    const { rateLimit } = await import('@/lib/rate-limit')
    const result = await rateLimit('acct-key-fail', 5, 60_000)

    expect(result.allowed).toBe(true)
  })

  it('reuses one Ratelimit instance per distinct (max, windowMs) pair instead of constructing a new one every call', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mockLimit.mockResolvedValue({ success: true, remaining: 1, reset: 1 })

    const { rateLimit } = await import('@/lib/rate-limit')
    await rateLimit('key-a', 5, 60_000)
    await rateLimit('key-b', 5, 60_000) // same (max, windowMs) — should reuse
    await rateLimit('key-c', 10, 60_000) // different max — new instance

    expect(RatelimitCtor).toHaveBeenCalledTimes(2)
  })
})
