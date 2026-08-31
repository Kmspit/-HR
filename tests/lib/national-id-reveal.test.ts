import { describe, it, expect } from 'vitest'
import { revealReducer, initialRevealState, idleTimeoutAction } from '@/lib/national-id-reveal'

describe('revealReducer — show/hide toggling never triggers a refetch', () => {
  it('starts hidden with no fetch', () => {
    expect(initialRevealState).toEqual({ status: 'hidden', value: '', fetchCount: 0 })
  })

  it('FETCHED moves to visible and counts one fetch', () => {
    const state = revealReducer(initialRevealState, { type: 'FETCHED', value: '1234567890123' })
    expect(state).toEqual({ status: 'visible', value: '1234567890123', fetchCount: 1 })
  })

  it('show → hide → show again stays at fetchCount 1 (no refetch)', () => {
    let state = revealReducer(initialRevealState, { type: 'FETCHED', value: '1234567890123' })
    state = revealReducer(state, { type: 'TOGGLE' }) // hide
    expect(state.status).toBe('masked')
    expect(state.fetchCount).toBe(1)
    state = revealReducer(state, { type: 'TOGGLE' }) // show again
    expect(state.status).toBe('visible')
    expect(state.fetchCount).toBe(1)
    state = revealReducer(state, { type: 'TOGGLE' }) // hide again
    expect(state.status).toBe('masked')
    expect(state.fetchCount).toBe(1)
  })

  it('TOGGLE before any fetch is a no-op (nothing to toggle yet)', () => {
    const state = revealReducer(initialRevealState, { type: 'TOGGLE' })
    expect(state).toEqual(initialRevealState)
  })

  it('CLEAR resets to hidden and wipes the value, but keeps the fetch count as history', () => {
    let state = revealReducer(initialRevealState, { type: 'FETCHED', value: '1234567890123' })
    state = revealReducer(state, { type: 'CLEAR' })
    expect(state.status).toBe('hidden')
    expect(state.value).toBe('')
    expect(state.fetchCount).toBe(1)
  })

  it('a second reveal after CLEAR is a real new fetch (fetchCount increments again)', () => {
    let state = revealReducer(initialRevealState, { type: 'FETCHED', value: '1234567890123' })
    state = revealReducer(state, { type: 'CLEAR' })
    state = revealReducer(state, { type: 'FETCHED', value: '1234567890123' })
    expect(state.fetchCount).toBe(2)
  })

  describe('HIDE — idle-timeout path used when a pending edit means the value must stay', () => {
    it('forces visible → masked, keeping the value (no CLEAR)', () => {
      let state = revealReducer(initialRevealState, { type: 'FETCHED', value: '1234567890123' })
      state = revealReducer(state, { type: 'HIDE' })
      expect(state).toEqual({ status: 'masked', value: '1234567890123', fetchCount: 1 })
    })

    it('is a no-op when already masked', () => {
      let state = revealReducer(initialRevealState, { type: 'FETCHED', value: '1234567890123' })
      state = revealReducer(state, { type: 'TOGGLE' }) // masked
      const beforeHide = state
      state = revealReducer(state, { type: 'HIDE' })
      expect(state).toEqual(beforeHide)
    })

    it('is a no-op when hidden (nothing fetched yet)', () => {
      const state = revealReducer(initialRevealState, { type: 'HIDE' })
      expect(state).toEqual(initialRevealState)
    })
  })
})

describe('idleTimeoutAction — auto-clear must never destroy an edit in progress', () => {
  it('ไม่มีการแก้ไขค้าง (ค่าเท่ากับที่ดึงมา) → CLEAR ตามเดิม', () => {
    expect(idleTimeoutAction('1234567890123', '1234567890123')).toBe('CLEAR')
  })

  it('มีการแก้ไขค้าง (ค่าไม่ตรงกับที่ดึงมา) → HIDE เท่านั้น ไม่ CLEAR', () => {
    expect(idleTimeoutAction('9876543210123', '1234567890123')).toBe('HIDE')
  })
})
