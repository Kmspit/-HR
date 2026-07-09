import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { padToMinDuration } from '@/lib/timing-safety'

describe('padToMinDuration', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('waits the remaining time when the handler finished early', async () => {
    const startedAt = Date.now()
    vi.advanceTimersByTime(50) // simulate 50ms of real work already elapsed

    const p = padToMinDuration(startedAt, 400)
    let resolved = false
    p.then(() => { resolved = true })

    await vi.advanceTimersByTimeAsync(349)
    expect(resolved).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(resolved).toBe(true)
  })

  it('resolves immediately (no extra wait) when the handler already took longer than the floor', async () => {
    const startedAt = Date.now()
    vi.advanceTimersByTime(500) // already past the 400ms floor

    let resolved = false
    padToMinDuration(startedAt, 400).then(() => { resolved = true })

    await vi.advanceTimersByTimeAsync(0)
    expect(resolved).toBe(true)
  })
})
