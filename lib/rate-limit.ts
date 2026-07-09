/**
 * Rate limiter for security-sensitive endpoints (login, register, forgot-
 * password, 2FA OTP, client-portal login).
 *
 * Backed by Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are configured —
 * a single shared counter across every Vercel serverless instance. Falls back
 * to an in-memory counter (per-instance only) when they're not, so this
 * module works out of the box without requiring an Upstash account, but the
 * limit is only truly enforced once Upstash is configured: on Vercel, each
 * concurrent instance gets its own in-memory counter, so the effective limit
 * under the fallback is `max` multiplied by however many instances happen to
 * be warm — worst exactly when an attacker's traffic triggers autoscaling.
 */
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number }

// ── In-memory fallback (per serverless instance only) ───────────────────────

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

function pruneExpired() {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key)
  }
}

function rateLimitInMemory(key: string, max: number, windowMs: number): RateLimitResult {
  pruneExpired()

  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs }
  }

  entry.count += 1

  if (entry.count > max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt }
}

// ── Upstash-backed (shared across all instances) ────────────────────────────

let redis: Redis | null = null
let warnedNoUpstash = false

function getRedis(): Redis | null {
  if (redis) return redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    if (!warnedNoUpstash) {
      console.warn(
        '[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — falling back to ' +
        'in-memory rate limiting, which is NOT shared across serverless instances.',
      )
      warnedNoUpstash = true
    }
    return null
  }
  redis = new Redis({ url, token })
  return redis
}

// One Ratelimit instance per distinct (max, windowMs) pair, reused across
// calls with the same limit configuration instead of reconstructing it every
// request.
const limiters = new Map<string, Ratelimit>()

function getLimiter(client: Redis, max: number, windowMs: number): Ratelimit {
  const cacheKey = `${max}:${windowMs}`
  let limiter = limiters.get(cacheKey)
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.fixedWindow(max, `${windowMs} ms`),
      prefix: 'hrflow-ratelimit',
    })
    limiters.set(cacheKey, limiter)
  }
  return limiter
}

/**
 * Check and record one hit against `key`, allowing at most `max` hits per
 * `windowMs`. Same fixed-window semantics whether backed by Upstash or the
 * in-memory fallback.
 */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const client = getRedis()
  if (!client) {
    return rateLimitInMemory(key, max, windowMs)
  }

  try {
    const limiter = getLimiter(client, max, windowMs)
    const result = await limiter.limit(key)
    return { allowed: result.success, remaining: result.remaining, resetAt: result.reset }
  } catch (err) {
    // Upstash unreachable — fail open to the in-memory fallback rather than
    // taking security-sensitive endpoints down entirely.
    console.error('[rate-limit] Upstash request failed, falling back to in-memory:', err)
    return rateLimitInMemory(key, max, windowMs)
  }
}
