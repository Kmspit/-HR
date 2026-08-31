import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createIdleTimer } from '@/lib/idle-timer'

describe('createIdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires onIdle after ms of no activity', () => {
    const onIdle = vi.fn()
    const timer = createIdleTimer(onIdle, 60_000)
    timer.touch()
    vi.advanceTimersByTime(60_000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('does not fire before ms has elapsed', () => {
    const onIdle = vi.fn()
    const timer = createIdleTimer(onIdle, 60_000)
    timer.touch()
    vi.advanceTimersByTime(59_999)
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('touch() resets the clock — activity before the deadline delays firing', () => {
    const onIdle = vi.fn()
    const timer = createIdleTimer(onIdle, 60_000)
    timer.touch()
    vi.advanceTimersByTime(30_000)
    timer.touch() // activity — resets
    vi.advanceTimersByTime(30_000) // 60s since first touch, only 30s since second
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(30_000) // now 60s since the reset
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('cancel() prevents onIdle from firing', () => {
    const onIdle = vi.fn()
    const timer = createIdleTimer(onIdle, 60_000)
    timer.touch()
    timer.cancel()
    vi.advanceTimersByTime(60_000)
    expect(onIdle).not.toHaveBeenCalled()
  })
})
