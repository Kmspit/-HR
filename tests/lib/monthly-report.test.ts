import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({
  prisma: {
    companyHoliday: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn() },
    attendance: { findMany: vi.fn() },
    leaveRequest: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

import { prisma } from '@/lib/prisma'
import { buildMonthlyReport } from '@/lib/monthly-report'

function baseAttendance(overrides: Record<string, unknown> = {}) {
  return {
    date: new Date('2026-06-05T00:00:00'),
    checkIn: new Date('2026-06-05T09:00:00'),
    checkOut: new Date('2026-06-05T18:00:00'),
    lunchOut: new Date('2026-06-05T12:00:00'),
    lunchIn: new Date('2026-06-05T13:00:00'),
    status: 'NORMAL',
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    workPlaceName: 'HQ',
    workMinutes: 480,
    leaveType: null,
    lat: 13.75,
    lng: 100.5,
    ...overrides,
  }
}

/**
 * 2026-09-23 (Group 2, CONTRIBUTING.md explicit-select rule) — buildMonthlyReport's
 * prisma.attendance.findMany was bare/full-select; this pins down that its
 * output (workDays/lateDays/lateMinutes/estimatedLateDeduction/attendances[])
 * still comes out correctly with the narrowed select, and that the select
 * itself includes every field the function (and computeLateDeduction) reads.
 */
describe('buildMonthlyReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.companyHoliday.findMany).mockResolvedValue([])
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', name: 'พนักงาน หนึ่ง', employeeId: 'E001', department: 'ฝ่ายบุคคล', role: 'EMPLOYEE', baseSalary: 30000, branchId: 'b1' },
    ] as never)
  })

  it('computes workDays/lateDays/lateMinutes from the attendance rows', async () => {
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      baseAttendance(),
      baseAttendance({ date: new Date('2026-06-06T00:00:00'), status: 'LATE', lateMinutes: 15 }),
    ] as never)

    const report = await buildMonthlyReport(6, 2026)

    expect(report.employees).toHaveLength(1)
    expect(report.employees[0].workDays).toBe(2)
    expect(report.employees[0].lateDays).toBe(1)
    expect(report.employees[0].lateMinutes).toBe(15)
  })

  it('maps every field the returned attendances[] rows expose (date/checkIn/checkOut/lunch/workPlaceName/workMinutes/leaveType/lat/lng)', async () => {
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([baseAttendance()] as never)

    const report = await buildMonthlyReport(6, 2026)
    const row = report.employees[0].attendances[0]

    expect(row.checkIn).toBeTruthy()
    expect(row.checkOut).toBeTruthy()
    expect(row.lunchOut).toBeTruthy()
    expect(row.lunchIn).toBeTruthy()
    expect(row.workPlaceName).toBe('HQ')
    expect(row.workMinutes).toBe(480)
    expect(row.lat).toBe(13.75)
    expect(row.lng).toBe(100.5)
  })

  it('the attendance.findMany select includes every field the function and computeLateDeduction read', async () => {
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([baseAttendance()] as never)
    await buildMonthlyReport(6, 2026)

    const call = vi.mocked(prisma.attendance.findMany).mock.calls[0][0] as { select: Record<string, boolean> }
    for (const field of [
      'date', 'checkIn', 'checkOut', 'lunchOut', 'lunchIn', 'status', 'lateMinutes',
      'earlyLeaveMinutes', 'workPlaceName', 'workMinutes', 'leaveType', 'lat', 'lng',
    ]) {
      expect(call.select[field], `expected select to include "${field}"`).toBe(true)
    }
  })
})
