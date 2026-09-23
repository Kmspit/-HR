import { describe, it, expect } from 'vitest'
import { computeCheckInLateness, computeCheckOutEarlyLeave } from '@/lib/attendance-time-calc'

/**
 * Extracted 2026-09-23 from app/api/attendance/checkin/route.ts and
 * app/api/attendance/checkout/route.ts (mechanical relocation, no logic
 * change — see the commit diff). These tests pin down the exact behavior so
 * both the real check-in/out routes and the upcoming Excel backdated-
 * attendance import can rely on it staying identical.
 */
describe('computeCheckInLateness', () => {
  const settings = { workStartTime: '08:30', lateGraceMin: 5 }

  it('is NORMAL, 0 minutes when checking in before the deadline', () => {
    const now = new Date('2026-09-23T08:20:00+07:00')
    const result = computeCheckInLateness({ now, forceOutside: false, hasOutsideWorkApproval: false, settings })
    expect(result).toEqual({ lateMinutes: 0, status: 'NORMAL' })
  })

  it('is NORMAL exactly at the grace-period deadline (08:35, inclusive boundary)', () => {
    const now = new Date('2026-09-23T08:35:00+07:00')
    const result = computeCheckInLateness({ now, forceOutside: false, hasOutsideWorkApproval: false, settings })
    expect(result).toEqual({ lateMinutes: 0, status: 'NORMAL' })
  })

  it('is LATE by 1 minute just past the grace-period deadline', () => {
    const now = new Date('2026-09-23T08:36:00+07:00')
    const result = computeCheckInLateness({ now, forceOutside: false, hasOutsideWorkApproval: false, settings })
    expect(result).toEqual({ lateMinutes: 1, status: 'LATE' })
  })

  it('is LATE by 30 minutes for a check-in well past the deadline', () => {
    const now = new Date('2026-09-23T09:05:00+07:00')
    const result = computeCheckInLateness({ now, forceOutside: false, hasOutsideWorkApproval: false, settings })
    expect(result).toEqual({ lateMinutes: 30, status: 'LATE' })
  })

  it('defaults the grace period to 5 minutes when lateGraceMin is null', () => {
    const now = new Date('2026-09-23T08:36:00+07:00')
    const result = computeCheckInLateness({
      now, forceOutside: false, hasOutsideWorkApproval: false,
      settings: { workStartTime: '08:30', lateGraceMin: null },
    })
    expect(result).toEqual({ lateMinutes: 1, status: 'LATE' })
  })

  it('is NORMAL when settings/workStartTime is missing (no deadline to compare against)', () => {
    const now = new Date('2026-09-23T23:00:00+07:00')
    expect(computeCheckInLateness({ now, forceOutside: false, hasOutsideWorkApproval: false, settings: null }))
      .toEqual({ lateMinutes: 0, status: 'NORMAL' })
    expect(computeCheckInLateness({ now, forceOutside: false, hasOutsideWorkApproval: false, settings: { workStartTime: null, lateGraceMin: 5 } }))
      .toEqual({ lateMinutes: 0, status: 'NORMAL' })
  })

  describe('outside-work path (forceOutside + hasOutsideWorkApproval)', () => {
    it('is NORMAL before the 09:00 outside-work deadline, regardless of the in-office settings', () => {
      const now = new Date('2026-09-23T08:59:00+07:00')
      const result = computeCheckInLateness({ now, forceOutside: true, hasOutsideWorkApproval: true, settings })
      expect(result).toEqual({ lateMinutes: 0, status: 'NORMAL' })
    })

    it('is LATE past the 09:00 outside-work deadline (no grace period for outside work)', () => {
      const now = new Date('2026-09-23T09:10:00+07:00')
      const result = computeCheckInLateness({ now, forceOutside: true, hasOutsideWorkApproval: true, settings })
      expect(result).toEqual({ lateMinutes: 10, status: 'LATE' })
    })

    it('falls through to the in-office deadline when forceOutside is true but there is no approval', () => {
      // A check-in flagged "outside" without an approved OutsideWorkRequest never
      // reaches this function in practice (the route blocks it earlier), but the
      // function itself must not silently apply the outside-work deadline in
      // that case — confirms hasOutsideWorkApproval is load-bearing, not forceOutside alone.
      const now = new Date('2026-09-23T08:36:00+07:00')
      const result = computeCheckInLateness({ now, forceOutside: true, hasOutsideWorkApproval: false, settings })
      expect(result).toEqual({ lateMinutes: 0, status: 'NORMAL' })
    })
  })
})

describe('computeCheckOutEarlyLeave', () => {
  const settings = { workEndTime: '17:00' }

  it('is unchanged (keeps currentStatus, 0 minutes) when checking out at/after workEndTime', () => {
    const now = new Date('2026-09-23T17:00:00+07:00')
    expect(computeCheckOutEarlyLeave({ now, currentStatus: 'NORMAL', settings }))
      .toEqual({ earlyLeaveMinutes: 0, status: 'NORMAL' })
    expect(computeCheckOutEarlyLeave({ now: new Date('2026-09-23T18:00:00+07:00'), currentStatus: 'LATE', settings }))
      .toEqual({ earlyLeaveMinutes: 0, status: 'LATE' })
  })

  it('is EARLY_LEAVE with the correct minute count when checking out before workEndTime', () => {
    const now = new Date('2026-09-23T16:30:00+07:00')
    const result = computeCheckOutEarlyLeave({ now, currentStatus: 'NORMAL', settings })
    expect(result).toEqual({ earlyLeaveMinutes: 30, status: 'EARLY_LEAVE' })
  })

  it('overwrites an existing LATE status with EARLY_LEAVE when leaving early (matches original inline behavior)', () => {
    const now = new Date('2026-09-23T16:45:00+07:00')
    const result = computeCheckOutEarlyLeave({ now, currentStatus: 'LATE', settings })
    expect(result).toEqual({ earlyLeaveMinutes: 15, status: 'EARLY_LEAVE' })
  })

  it('keeps currentStatus unchanged when settings/workEndTime is missing', () => {
    const now = new Date('2026-09-23T10:00:00+07:00')
    expect(computeCheckOutEarlyLeave({ now, currentStatus: 'NORMAL', settings: null }))
      .toEqual({ earlyLeaveMinutes: 0, status: 'NORMAL' })
    expect(computeCheckOutEarlyLeave({ now, currentStatus: 'NORMAL', settings: { workEndTime: null } }))
      .toEqual({ earlyLeaveMinutes: 0, status: 'NORMAL' })
  })
})
