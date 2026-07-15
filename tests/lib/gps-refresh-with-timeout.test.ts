import { describe, it, expect, vi, afterEach } from 'vitest'
import { refreshGpsWithTimeout, type GetCurrentPositionFn, type GeolocationPositionLike } from '@/lib/gps-fence'

describe('refreshGpsWithTimeout — submit-time GPS refresh (Phase A item 4)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves with fresh coordinates on success', async () => {
    const getCurrentPosition: GetCurrentPositionFn = (onSuccess) => {
      onSuccess({ coords: { latitude: 13.75, longitude: 100.5, accuracy: 8 } })
    }
    const result = await refreshGpsWithTimeout(getCurrentPosition, 5000)
    expect(result).toEqual({ lat: 13.75, lng: 100.5, accuracy: 8 })
  })

  it('resolves null (not a rejection) when the browser reports an error — caller falls back gracefully', async () => {
    const getCurrentPosition: GetCurrentPositionFn = (_onSuccess, onError) => {
      onError(new Error('PERMISSION_DENIED'))
    }
    await expect(refreshGpsWithTimeout(getCurrentPosition, 5000)).resolves.toBeNull()
  })

  it('resolves null after the timeout elapses if the device never calls back at all', async () => {
    vi.useFakeTimers()
    const getCurrentPosition: GetCurrentPositionFn = () => {
      // Never calls onSuccess or onError — simulates a hung/unresponsive GPS chip.
    }
    const promise = refreshGpsWithTimeout(getCurrentPosition, 5000)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(promise).resolves.toBeNull()
  })

  it('ignores a late success callback that arrives after the timeout already fired', async () => {
    vi.useFakeTimers()
    const onSuccessSpy = vi.fn()
    const getCurrentPosition: GetCurrentPositionFn = (onSuccess) => {
      onSuccessSpy.mockImplementation(onSuccess)
    }
    const promise = refreshGpsWithTimeout(getCurrentPosition, 5000)
    await vi.advanceTimersByTimeAsync(5000) // timeout fires, resolves null
    const lateResult: GeolocationPositionLike = { coords: { latitude: 1, longitude: 2, accuracy: 3 } }
    onSuccessSpy(lateResult) // arrives too late
    await expect(promise).resolves.toBeNull()
  })

  it('passes maximumAge:0 so the browser cannot serve a stale cached position', async () => {
    const getCurrentPosition: GetCurrentPositionFn = vi.fn((onSuccess) => {
      onSuccess({ coords: { latitude: 1, longitude: 2, accuracy: 3 } })
    })
    await refreshGpsWithTimeout(getCurrentPosition, 5000)
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ maximumAge: 0 }),
    )
  })
})
