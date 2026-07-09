import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

const attendanceFindMany = vi.fn()
const attendanceFindFirst = vi.fn()
const attendanceFindUnique = vi.fn()
const attendanceUpdate = vi.fn()
const attendanceCreate = vi.fn()
const leaveRequestFindMany = vi.fn()
const leaveRequestFindFirst = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    attendance: {
      findMany: (...a: unknown[]) => attendanceFindMany(...a),
      findFirst: (...a: unknown[]) => attendanceFindFirst(...a),
      findUnique: (...a: unknown[]) => attendanceFindUnique(...a),
      update: (...a: unknown[]) => attendanceUpdate(...a),
      create: (...a: unknown[]) => attendanceCreate(...a),
    },
    leaveRequest: {
      findMany: (...a: unknown[]) => leaveRequestFindMany(...a),
      findFirst: (...a: unknown[]) => leaveRequestFindFirst(...a),
    },
  },
}))

import {
  buildMonthlyWorkLog,
  buildMonthlyWorkLogForTeam,
  finalizeAttendanceRecord,
} from '@/lib/attendance-work-log'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Distinguishes syncApprovedLeaveAttendance's own per-user leaveRequest.findMany
 * (where.userId is a plain string) from the new batched fetch's call
 * (where.userId is `{ in: [...] }`) so each can be given different canned data. */
function setLeaveRequestMock(leavesForBatchedFetch: unknown[]) {
  leaveRequestFindMany.mockImplementation(({ where }: { where: { userId: unknown } }) => {
    if (where.userId && typeof where.userId === 'object' && 'in' in (where.userId as object)) {
      return Promise.resolve(leavesForBatchedFetch)
    }
    return Promise.resolve([]) // sync's own per-user query — no pending leave-day sync needed in these tests
  })
}

function baseAttendance(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    userId: 'user-1',
    date: new Date('2026-06-01T00:00:00'),
    sessionIndex: 1,
    checkIn: new Date('2026-06-01T09:00:00'),
    checkOut: new Date('2026-06-01T18:00:00'),
    lunchOut: new Date('2026-06-01T12:00:00'),
    lunchIn: new Date('2026-06-01T13:00:00'),
    lat: null, lng: null, address: null, workPlaceName: null,
    checkInLat: null, checkInLng: null, checkInAddress: null, checkInWorkPlaceName: null,
    checkOutLat: null, checkOutLng: null, checkOutAddress: null, checkOutWorkPlaceName: null,
    photoUrl: null, checkOutPhotoUrl: null, lunchOutPhotoUrl: null, lunchInPhotoUrl: null,
    isOutside: false,
    status: 'NORMAL',
    approved: true,
    attendanceStatus: 'completed',
    dayOfWeek: 1,
    workMinutes: 480, // 9:00-18:00 minus 1hr lunch = 8hr = 480min, already computed+stored
    leaveType: null,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    lunchOverMinutes: 0,
    note: null,
    ...overrides,
  }
}

describe('buildMonthlyWorkLog — batched finalize replaces the N+1 loop, output unchanged', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setLeaveRequestMock([])
  })

  it('fetches attendance exactly once (no double-fetch before/after finalize)', async () => {
    attendanceFindMany.mockResolvedValue([baseAttendance()])
    await buildMonthlyWorkLog('user-1', 6, 2026)
    expect(attendanceFindMany).toHaveBeenCalledTimes(1)
  })

  it('never calls findUnique — the batched path does not use the per-record finalize function', async () => {
    attendanceFindMany.mockResolvedValue([baseAttendance()])
    await buildMonthlyWorkLog('user-1', 6, 2026)
    expect(attendanceFindUnique).not.toHaveBeenCalled()
  })

  it('fetches leave requests via one batched findMany, not one findFirst per attendance record', async () => {
    const records = Array.from({ length: 10 }, (_, i) => baseAttendance({ id: `att-${i}`, sessionIndex: 1 }))
    attendanceFindMany.mockResolvedValue(records)
    await buildMonthlyWorkLog('user-1', 6, 2026)
    // leaveRequestFindMany is called once by sync + once by the batched fetch = 2 total,
    // regardless of how many attendance records exist (was previously 1 findFirst PER record).
    expect(leaveRequestFindMany).toHaveBeenCalledTimes(2)
  })

  it('skips the write entirely when a record already has its finalized values (no-op update elimination)', async () => {
    // baseAttendance() is already fully finalized: approved=true, attendanceStatus='completed',
    // dayOfWeek matches its date, workMinutes matches computeWorkMinutes, status/leaveType stable.
    attendanceFindMany.mockResolvedValue([baseAttendance()])
    await buildMonthlyWorkLog('user-1', 6, 2026)
    expect(attendanceUpdate).not.toHaveBeenCalled()
  })

  it('writes only the records whose computed value actually differs from what is stored', async () => {
    const stale = baseAttendance({ id: 'stale-1', workMinutes: 0, attendanceStatus: 'pending' }) // needs finalize
    const fresh = baseAttendance({ id: 'fresh-1' }) // already finalized
    attendanceFindMany.mockResolvedValue([stale, fresh])
    attendanceUpdate.mockResolvedValue({ ...stale, workMinutes: 480, attendanceStatus: 'completed', approved: true })

    await buildMonthlyWorkLog('user-1', 6, 2026)

    expect(attendanceUpdate).toHaveBeenCalledTimes(1)
    expect(attendanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'stale-1' } }),
    )
  })

  it('backfills checkInLat/Lng/Address/WorkPlaceName from lat/lng/address/workPlaceName only when checkInLat is null', async () => {
    const needsBackfill = baseAttendance({
      id: 'gps-1', checkInLat: null, lat: 13.75, lng: 100.5, address: 'BKK', workPlaceName: 'HQ',
    })
    attendanceFindMany.mockResolvedValue([needsBackfill])
    attendanceUpdate.mockResolvedValue(needsBackfill)

    await buildMonthlyWorkLog('user-1', 6, 2026)

    expect(attendanceUpdate).toHaveBeenCalledWith({
      where: { id: 'gps-1' },
      data: expect.objectContaining({
        checkInLat: 13.75, checkInLng: 100.5, checkInAddress: 'BKK', checkInWorkPlaceName: 'HQ',
      }),
    })
  })

  it('does NOT overwrite checkInLat when it is already set', async () => {
    const alreadyHasGps = baseAttendance({
      id: 'gps-2', checkInLat: 10, checkInLng: 20, checkInAddress: 'Old', checkInWorkPlaceName: 'Old HQ',
      lat: 99, lng: 99, address: 'New', workPlaceName: 'New HQ',
    })
    attendanceFindMany.mockResolvedValue([alreadyHasGps])
    await buildMonthlyWorkLog('user-1', 6, 2026)
    // Nothing else differs and checkInLat is already set, so this row needs no write at all.
    expect(attendanceUpdate).not.toHaveBeenCalled()
  })

  it('applies an approved full-day leave to a no-check-in record: status becomes LEAVE, leaveType is set', async () => {
    const leaveDayRow = baseAttendance({
      id: 'leave-1', checkIn: null, checkOut: null, lunchOut: null, lunchIn: null,
      status: 'NORMAL', workMinutes: 0, leaveType: null, attendanceStatus: 'pending', approved: false,
    })
    attendanceFindMany.mockResolvedValue([leaveDayRow])
    setLeaveRequestMock([
      { id: 'lv-1', userId: 'user-1', type: 'VACATION', days: 1, startDate: new Date('2026-06-01'), endDate: new Date('2026-06-01') },
    ])
    attendanceUpdate.mockImplementation(({ data }) => Promise.resolve({ ...leaveDayRow, ...data }))

    const result = await buildMonthlyWorkLog('user-1', 6, 2026)

    expect(attendanceUpdate).toHaveBeenCalledWith({
      where: { id: 'leave-1' },
      data: expect.objectContaining({ status: 'LEAVE', leaveType: 'VACATION' }),
    })
    expect(result.rows[0].status).toBe('LEAVE')
    expect(result.rows[0].leaveType).toBe('VACATION')
    expect(result.summary.leave).toBe(1)
    expect(result.summary.present).toBe(0)
  })

  it('applies a partial-day (< 1 day) approved leave to a checked-in-no-checkout record: NORMAL becomes HALF_DAY', async () => {
    const halfDayRow = baseAttendance({
      id: 'half-1', checkOut: null, lunchOut: null, lunchIn: null,
      status: 'NORMAL', workMinutes: 0, attendanceStatus: 'pending', approved: false,
    })
    attendanceFindMany.mockResolvedValue([halfDayRow])
    setLeaveRequestMock([
      { id: 'lv-2', userId: 'user-1', type: 'PERSONAL', days: 0.5, startDate: new Date('2026-06-01'), endDate: new Date('2026-06-01') },
    ])
    attendanceUpdate.mockImplementation(({ data }) => Promise.resolve({ ...halfDayRow, ...data }))

    const result = await buildMonthlyWorkLog('user-1', 6, 2026)

    expect(attendanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'HALF_DAY', leaveType: 'PERSONAL' }) }),
    )
    expect(result.summary.halfDay).toBe(1)
  })

  it('a partial-day approved leave does NOT downgrade a non-NORMAL status (e.g. LATE stays LATE, not HALF_DAY)', async () => {
    const lateRow = baseAttendance({
      id: 'late-1', checkOut: null, lunchOut: null, lunchIn: null,
      status: 'LATE', workMinutes: 0, attendanceStatus: 'pending', approved: false,
    })
    attendanceFindMany.mockResolvedValue([lateRow])
    setLeaveRequestMock([
      { id: 'lv-3', userId: 'user-1', type: 'PERSONAL', days: 0.5, startDate: new Date('2026-06-01'), endDate: new Date('2026-06-01') },
    ])
    attendanceUpdate.mockImplementation(({ data }) => Promise.resolve({ ...lateRow, ...data }))

    const result = await buildMonthlyWorkLog('user-1', 6, 2026)

    expect(result.rows[0].status).toBe('LATE')
  })

  it('picks the leave with the latest startDate when multiple approved leaves cover the same date (matches findFirst orderBy startDate desc)', async () => {
    const row = baseAttendance({
      id: 'multi-1', checkIn: null, checkOut: null, lunchOut: null, lunchIn: null,
      status: 'NORMAL', workMinutes: 0, attendanceStatus: 'pending', approved: false,
    })
    attendanceFindMany.mockResolvedValue([row])
    setLeaveRequestMock([
      { id: 'lv-older', userId: 'user-1', type: 'SICK', days: 1, startDate: new Date('2026-05-30'), endDate: new Date('2026-06-02') },
      { id: 'lv-newer', userId: 'user-1', type: 'VACATION', days: 1, startDate: new Date('2026-05-31'), endDate: new Date('2026-06-02') },
    ])
    attendanceUpdate.mockImplementation(({ data }) => Promise.resolve({ ...row, ...data }))

    const result = await buildMonthlyWorkLog('user-1', 6, 2026)

    expect(result.rows[0].leaveType).toBe('VACATION') // lv-newer has the later startDate
  })

  it('summary totals (work minutes, late minutes, early-leave minutes, lunch-over minutes) are computed correctly across mixed rows', async () => {
    // dayOfWeek set to match each date exactly (Mon=1, Tue=2, Wed=3) so none of
    // these rows need a write — this test is about summary math, not the
    // write-merge path (covered separately above).
    const present = baseAttendance({ id: 'p1', workMinutes: 480, lateMinutes: 10, earlyLeaveMinutes: 0, lunchOverMinutes: 5, sessionIndex: 1, dayOfWeek: 1 })
    const late = baseAttendance({
      id: 'p2', date: new Date('2026-06-02'), dayOfWeek: 2, status: 'LATE',
      checkIn: new Date('2026-06-02T09:00:00'), checkOut: new Date('2026-06-02T16:40:00'), // 460min - 60min lunch = 400
      lunchOut: new Date('2026-06-02T12:00:00'), lunchIn: new Date('2026-06-02T13:00:00'),
      workMinutes: 400, lateMinutes: 30, sessionIndex: 1,
    })
    const absent = baseAttendance({
      id: 'a1', date: new Date('2026-06-03'), dayOfWeek: 3, checkIn: null, checkOut: null, lunchOut: null, lunchIn: null,
      status: 'ABSENT', workMinutes: 0,
    })
    attendanceFindMany.mockResolvedValue([present, late, absent])

    const result = await buildMonthlyWorkLog('user-1', 6, 2026)

    expect(result.summary).toEqual({
      present: 2,
      late: 1,
      leave: 0,
      absent: 1,
      halfDay: 0,
      earlyLeave: 0,
      totalWorkMinutes: 880,
      totalLateMinutes: 40,
      totalEarlyMinutes: 0,
      totalLunchOverMinutes: 5,
    })
  })
})

describe('buildMonthlyWorkLog — write concurrency is throttled, not an unbounded burst', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setLeaveRequestMock([])
  })

  it('never has more than 20 attendance.update calls in flight at once, even with 55 records all needing a write', async () => {
    const N = 55
    const records = Array.from({ length: N }, (_, i) =>
      baseAttendance({ id: `r${i}`, attendanceStatus: 'pending', approved: false }),
    )
    attendanceFindMany.mockResolvedValue(records)

    let inFlight = 0
    let maxInFlight = 0
    attendanceUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      const original = records.find((r) => r.id === where.id)
      return { ...original, ...data }
    })

    await buildMonthlyWorkLog('user-1', 6, 2026)

    expect(attendanceUpdate).toHaveBeenCalledTimes(N)
    expect(maxInFlight).toBeLessThanOrEqual(20)
    expect(maxInFlight).toBeGreaterThan(1) // still genuinely concurrent, not accidentally serialized to 1-at-a-time
  })

  it('does not under-utilize the limit when fewer records need updating than the cap', async () => {
    const N = 8 // below the 20-concurrency cap
    const records = Array.from({ length: N }, (_, i) =>
      baseAttendance({ id: `r${i}`, attendanceStatus: 'pending', approved: false }),
    )
    attendanceFindMany.mockResolvedValue(records)

    let inFlight = 0
    let maxInFlight = 0
    attendanceUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      const original = records.find((r) => r.id === where.id)
      return { ...original, ...data }
    })

    await buildMonthlyWorkLog('user-1', 6, 2026)

    expect(maxInFlight).toBe(N) // all 8 fire together in a single batch, no artificial serialization
  })

  it('never calls attendance.update at all when nothing needs finalizing (no batches spun up unnecessarily)', async () => {
    attendanceFindMany.mockResolvedValue([baseAttendance()]) // already fully finalized
    await buildMonthlyWorkLog('user-1', 6, 2026)
    expect(attendanceUpdate).not.toHaveBeenCalled()
  })
})

describe('buildMonthlyWorkLogForTeam — batched across the whole team, not per-employee sequential', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setLeaveRequestMock([])
  })

  const users = [
    { id: 'u1', name: 'กอไก่', employeeId: 'E001', status: 'ACTIVE' },
    { id: 'u2', name: 'ขอไข่', employeeId: 'E002', status: 'ACTIVE' },
    { id: 'u3', name: 'คอควาย', employeeId: 'E003', status: 'ACTIVE' },
  ]

  it('fetches attendance for the whole team in exactly one findMany call, not one per employee', async () => {
    attendanceFindMany.mockResolvedValue([
      baseAttendance({ id: 'a-u1', userId: 'u1' }),
      baseAttendance({ id: 'a-u2', userId: 'u2' }),
      baseAttendance({ id: 'a-u3', userId: 'u3' }),
    ])

    await buildMonthlyWorkLogForTeam(users, 6, 2026)

    expect(attendanceFindMany).toHaveBeenCalledTimes(1)
    expect(attendanceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: { in: ['u1', 'u2', 'u3'] } }) }),
    )
  })

  it('fetches leave requests for the whole team in one batched call (plus one per-user sync call, unchanged/out of scope)', async () => {
    attendanceFindMany.mockResolvedValue([
      baseAttendance({ id: 'a-u1', userId: 'u1' }),
      baseAttendance({ id: 'a-u2', userId: 'u2' }),
      baseAttendance({ id: 'a-u3', userId: 'u3' }),
    ])

    await buildMonthlyWorkLogForTeam(users, 6, 2026)

    // 3 sync calls (one per user, untouched by this fix) + 1 batched fetch call = 4,
    // versus the old sequential per-user path which would have been 1 findFirst PER RECORD PER USER.
    expect(leaveRequestFindMany).toHaveBeenCalledTimes(4)
  })

  it('attaches correct employee metadata and sorts by date then Thai employee name', async () => {
    attendanceFindMany.mockResolvedValue([
      baseAttendance({ id: 'a-u2', userId: 'u2', date: new Date('2026-06-01') }),
      baseAttendance({ id: 'a-u1', userId: 'u1', date: new Date('2026-06-01') }),
    ])

    const result = await buildMonthlyWorkLogForTeam(users, 6, 2026)

    expect(result.employeeCount).toBe(3)
    expect(result.rows.map((r) => r.employeeName)).toEqual(['กอไก่', 'ขอไข่']) // ก sorts before ข
    expect(result.rows[0].employeeCode).toBe('E001')
    expect(result.rows[0].id).toBe('u1-a-u1')
  })
})

describe('finalizeAttendanceRecord — single-record path used by checkin/checkout/lunch/hr-override is unchanged', () => {
  beforeEach(() => vi.clearAllMocks())

  it('still does findUnique + findFirst(leave) + update for a single record (unaffected by the batched path)', async () => {
    const att = baseAttendance({ id: 'single-1', attendanceStatus: 'pending', approved: false })
    attendanceFindUnique.mockResolvedValue(att)
    leaveRequestFindFirst.mockResolvedValue(null)
    attendanceUpdate.mockResolvedValue({ ...att, attendanceStatus: 'completed', approved: true })

    await finalizeAttendanceRecord('single-1')

    expect(attendanceFindUnique).toHaveBeenCalledWith({ where: { id: 'single-1' } })
    expect(leaveRequestFindFirst).toHaveBeenCalled()
    expect(attendanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'single-1' } }),
    )
  })
})
