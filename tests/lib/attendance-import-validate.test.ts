import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    attendance: { findMany: vi.fn() },
    companyHoliday: { findMany: vi.fn().mockResolvedValue([]) },
    leaveRequest: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock('@/lib/company-settings-cache', () => ({
  getCachedCompanySettings: vi.fn().mockResolvedValue({
    workStartTime: '08:30', lateGraceMin: 5, workEndTime: '17:00',
  }),
}))

import { prisma } from '@/lib/prisma'
import { validateAndComputeAttendanceImportRows } from '@/lib/attendance-import-validate'
import type { AttendanceImportRawRow } from '@/lib/attendance-import-parse'

function rawRow(overrides: Partial<AttendanceImportRawRow> = {}): AttendanceImportRawRow {
  return {
    rowNumber: 2,
    employeeCell: 'สมชาย ใจดี (E001)',
    employeeName: 'สมชาย ใจดี',
    employeeCode: 'E001',
    dateCell: '23/09/2026',
    date: new Date('2026-09-23T00:00:00+07:00'),
    checkInCell: '08:05',
    checkIn: new Date('2026-09-23T08:05:00+07:00'),
    checkOutCell: '17:30',
    checkOut: new Date('2026-09-23T17:30:00+07:00'),
    lunchOutCell: '-',
    lunchOut: null,
    lunchInCell: '-',
    lunchIn: null,
    parseErrors: [],
    ...overrides,
  }
}

const employee = { id: 'u1', employeeId: 'E001', name: 'สมชาย ใจดี', baseSalary: 30000, branchId: 'b1' }

describe('validateAndComputeAttendanceImportRows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.companyHoliday.findMany).mockResolvedValue([])
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])
  })

  it('skips a row with structural parseErrors, without querying anything for it', async () => {
    const bad = rawRow({ parseErrors: ['ไม่มีวันที่'] })
    vi.mocked(prisma.user.findMany).mockResolvedValue([])
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])

    const result = await validateAndComputeAttendanceImportRows([bad])

    expect(result.toCreate).toHaveLength(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toContain('ไม่มีวันที่')
  })

  it('skips a row whose employee code does not match any real user', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]) // no match
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])

    const result = await validateAndComputeAttendanceImportRows([rawRow()])

    expect(result.toCreate).toHaveLength(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toContain('E001')
  })

  it('skips a row whose date already has attendance in the system', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([employee] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      { userId: 'u1', date: new Date('2026-09-23T00:00:00+07:00') },
    ] as never)

    const result = await validateAndComputeAttendanceImportRows([rawRow()])

    expect(result.toCreate).toHaveLength(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toContain('มีข้อมูลลงเวลา')
  })

  it('skips the second of two rows in the SAME file for the same employee+date (in-batch duplicate)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([employee] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([]) // nothing in DB yet

    const result = await validateAndComputeAttendanceImportRows([
      rawRow({ rowNumber: 2 }),
      rawRow({ rowNumber: 3 }),
    ])

    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].rowNumber).toBe(2)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].rowNumber).toBe(3)
  })

  it('computes lateMinutes/status using the exact same formula as a real check-in (computeCheckInLateness)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([employee] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])

    // 08:05 is before 08:30+5min grace (08:35) — should be NORMAL, 0 late minutes
    const onTime = await validateAndComputeAttendanceImportRows([rawRow()])
    expect(onTime.toCreate[0].status).toBe('NORMAL')
    expect(onTime.toCreate[0].lateMinutes).toBe(0)

    // 09:05 is 30 minutes past the 08:35 deadline
    const late = await validateAndComputeAttendanceImportRows([
      rawRow({ checkIn: new Date('2026-09-23T09:05:00+07:00') }),
    ])
    expect(late.toCreate[0].status).toBe('LATE')
    expect(late.toCreate[0].lateMinutes).toBe(30)
  })

  it('computes earlyLeaveMinutes/status using the exact same formula as a real checkout (computeCheckOutEarlyLeave)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([employee] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])

    // checkOut 16:30 is 30 min before 17:00
    const early = await validateAndComputeAttendanceImportRows([
      rawRow({ checkOut: new Date('2026-09-23T16:30:00+07:00') }),
    ])
    expect(early.toCreate[0].status).toBe('EARLY_LEAVE')
    expect(early.toCreate[0].earlyLeaveMinutes).toBe(30)
  })

  it('computes workMinutes the same way as a real attendance record (checkOut - checkIn, minus lunch)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([employee] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])

    const result = await validateAndComputeAttendanceImportRows([
      rawRow({
        checkIn: new Date('2026-09-23T09:00:00+07:00'),
        checkOut: new Date('2026-09-23T18:00:00+07:00'),
        lunchOut: new Date('2026-09-23T12:00:00+07:00'),
        lunchIn: new Date('2026-09-23T13:00:00+07:00'),
      }),
    ])
    expect(result.toCreate[0].workMinutes).toBe(480) // 9hr - 1hr lunch = 8hr
  })

  it('a row with checkOut null still creates (workMinutes 0, status from check-in only)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([employee] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])

    const result = await validateAndComputeAttendanceImportRows([rawRow({ checkOut: null })])
    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].workMinutes).toBe(0)
    expect(result.toCreate[0].checkOut).toBeNull()
  })

  it('estimates a late deduction using computeLateDeduction (same formula as payroll generate)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([employee] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])

    // 30 min late, baseSalary 30000 → rate = 30000/30/8/60 = 2.0833.../min
    const result = await validateAndComputeAttendanceImportRows([
      rawRow({ checkIn: new Date('2026-09-23T09:05:00+07:00') }),
    ])

    expect(result.estimatedDeductionByEmployee).toHaveLength(1)
    expect(result.estimatedDeductionByEmployee[0].userId).toBe('u1')
    expect(result.estimatedDeductionByEmployee[0].lateDays).toBe(1)
    expect(result.totalEstimatedDeduction).toBeGreaterThan(0)
    expect(result.totalEstimatedDeduction).toBeCloseTo((30000 / 30 / 8 / 60) * 30, 2)
  })

  it('does not include a deduction line for an on-time row', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([employee] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])

    const result = await validateAndComputeAttendanceImportRows([rawRow()])
    expect(result.estimatedDeductionByEmployee).toHaveLength(0)
    expect(result.totalEstimatedDeduction).toBe(0)
  })

  it('batches employee/attendance lookups once, not once per row', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([employee] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])

    await validateAndComputeAttendanceImportRows([
      rawRow({ rowNumber: 2, date: new Date('2026-09-23T00:00:00+07:00'), checkIn: new Date('2026-09-23T08:05:00+07:00') }),
      rawRow({ rowNumber: 3, date: new Date('2026-09-24T00:00:00+07:00'), checkIn: new Date('2026-09-24T08:05:00+07:00') }),
      rawRow({ rowNumber: 4, date: new Date('2026-09-25T00:00:00+07:00'), checkIn: new Date('2026-09-25T08:05:00+07:00') }),
    ])

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.attendance.findMany).toHaveBeenCalledTimes(1)
  })
})
