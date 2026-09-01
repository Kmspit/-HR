import { describe, it, expect } from 'vitest'
import {
  historyLoadReducer,
  initialHistoryLoadState,
  historyErrorMessage,
  historyCanRetry,
  shouldStartHistoryLoad,
  type HistoryLoadState,
} from '@/lib/employee-history-load'

describe('historyErrorMessage', () => {
  it('gives 403 its own "no permission" message', () => {
    expect(historyErrorMessage(403)).toBe('ไม่มีสิทธิ์ดูประวัติ')
  })

  it('gives every other status a generic retry-able message', () => {
    expect(historyErrorMessage(500)).toBe('โหลดประวัติไม่สำเร็จ')
    expect(historyErrorMessage(404)).toBe('โหลดประวัติไม่สำเร็จ')
    expect(historyErrorMessage(0)).toBe('โหลดประวัติไม่สำเร็จ') // network error / thrown exception
  })
})

describe('historyCanRetry', () => {
  it('is false for 403 — retrying will not fix a permission problem', () => {
    expect(historyCanRetry(403)).toBe(false)
  })

  it('is true for every other status', () => {
    expect(historyCanRetry(500)).toBe(true)
    expect(historyCanRetry(0)).toBe(true)
  })
})

describe('shouldStartHistoryLoad', () => {
  it('starts only when active and not already started', () => {
    expect(shouldStartHistoryLoad(true, false)).toBe(true)
  })

  it('never starts a second time once already started, even while still active', () => {
    expect(shouldStartHistoryLoad(true, true)).toBe(false)
  })

  it('never starts while the tab is not active', () => {
    expect(shouldStartHistoryLoad(false, false)).toBe(false)
    expect(shouldStartHistoryLoad(false, true)).toBe(false)
  })
})

describe('historyLoadReducer', () => {
  it('starts at idle', () => {
    expect(initialHistoryLoadState).toEqual({ phase: 'idle' })
  })

  it('START moves to loading from any state', () => {
    expect(historyLoadReducer(initialHistoryLoadState, { type: 'START' })).toEqual({ phase: 'loading' })
    const errored: HistoryLoadState = { phase: 'error', message: 'x', canRetry: true }
    expect(historyLoadReducer(errored, { type: 'START' })).toEqual({ phase: 'loading' })
  })

  it('SUCCESS moves to loaded with the given items', () => {
    const items = [{ id: '1', at: '2026-01-01', actorName: 'A', changes: ['x'] }]
    const result = historyLoadReducer(
      { phase: 'loading' },
      { type: 'SUCCESS', items, trackingStartedAt: '2026-08-31' },
    )
    expect(result).toEqual({ phase: 'loaded', items, trackingStartedAt: '2026-08-31' })
  })

  it('FAILURE moves to error with the right message/canRetry for the status', () => {
    const forbidden = historyLoadReducer({ phase: 'loading' }, { type: 'FAILURE', status: 403 })
    expect(forbidden).toEqual({ phase: 'error', message: 'ไม่มีสิทธิ์ดูประวัติ', canRetry: false })

    const serverError = historyLoadReducer({ phase: 'loading' }, { type: 'FAILURE', status: 500 })
    expect(serverError).toEqual({ phase: 'error', message: 'โหลดประวัติไม่สำเร็จ', canRetry: true })
  })

  it('every reachable path from loading ends in a terminal (loaded/error) state — never stuck', () => {
    // This is the actual regression this module exists to prevent: whatever
    // happens after START, the very next dispatch must be SUCCESS or FAILURE,
    // never something that leaves phase stuck at 'loading' indefinitely.
    const afterSuccess = historyLoadReducer({ phase: 'loading' }, { type: 'SUCCESS', items: [], trackingStartedAt: null })
    const afterFailure = historyLoadReducer({ phase: 'loading' }, { type: 'FAILURE', status: 0 })
    expect(afterSuccess.phase).not.toBe('loading')
    expect(afterFailure.phase).not.toBe('loading')
  })

  it('retry (a new START) from an error state moves back to loading', () => {
    const errored: HistoryLoadState = { phase: 'error', message: 'โหลดประวัติไม่สำเร็จ', canRetry: true }
    expect(historyLoadReducer(errored, { type: 'START' })).toEqual({ phase: 'loading' })
  })
})
