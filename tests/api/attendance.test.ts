import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    attendance: {
      create:     vi.fn(),
      findFirst:  vi.fn(),
      findMany:   vi.fn(),
      update:     vi.fn(),
    },
    user:            { findUnique: vi.fn() },
    companySettings: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    outsideWorkRequest: { findFirst: vi.fn().mockResolvedValue(null) },
    weeklyLawyerPlan:   { findFirst: vi.fn().mockResolvedValue(null) },
    weeklyPlanDay:      { findFirst: vi.fn().mockResolvedValue(null) },
  },
}))

vi.mock('@/lib/ensure-db-schema', () => ({
  ensureDbSchema: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/device', () => ({
  assertDeviceAllowed: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/face-checkin-guard', () => ({
  guardAttendanceFace: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/attendance-face-scan', () => ({
  formHasFaceImage:             vi.fn().mockReturnValue(false),
  imageBufferFromForm:          vi.fn().mockResolvedValue(null),
  recordFaceScanAndNotifyHr:    vi.fn().mockResolvedValue(null),
  syncAttendancePhotoFromFaceScan: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/attendance-work-log', () => ({
  finalizeAttendanceRecord: vi.fn().mockResolvedValue(undefined),
  getDayOfWeekIndex:        vi.fn().mockReturnValue(1),
}))

vi.mock('@/lib/attendance-leave-sync', () => ({
  findApprovedLeaveOnDate: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/attendance-flow', () => ({
  ATTENDANCE_COMPLETED_PATCH:  {},
  attendanceFlowErrorMessage:  vi.fn().mockReturnValue(''),
  validateAttendanceFlow:      vi.fn().mockReturnValue(null),
}))

vi.mock('@/lib/attendance-session', () => ({
  findActiveAttendanceSession: vi.fn().mockResolvedValue(null),
  getNextSessionIndex:         vi.fn().mockResolvedValue(1),
  hasCheckInToday:             vi.fn().mockResolvedValue(false),
}))

vi.mock('@/lib/gps-fence', () => ({
  haversineDistanceMeters: vi.fn().mockReturnValue(50),
  detectGpsSpoofFlags:     vi.fn().mockReturnValue([]),
}))

vi.mock('@/lib/outside-work', () => ({
  findApprovedOutsideWorkForDate: vi.fn().mockResolvedValue(null),
  OUTSIDE_WORK_LATE_TIME:        '09:30',
}))

vi.mock('@/lib/weekly-plan-attendance', () => ({
  findApprovedWeeklyPlanDayForDate:    vi.fn().mockResolvedValue(null),
  WEEKLY_PLAN_LOCATION_TOLERANCE_METERS: 500,
}))

vi.mock('@/lib/utils', () => ({
  parseCoord:        (v: unknown) => (v ? parseFloat(String(v)) : null),
  startOfTodayLocal: () => new Date(),
}))

vi.mock('@/lib/datetime-bangkok', () => ({
  bangkokDateKey: () => '2026-06-23',
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: vi.fn(),
  }
})

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formHasFaceImage } from '@/lib/attendance-face-scan'
import { finalizeAttendanceRecord } from '@/lib/attendance-work-log'
import { POST as checkinPost } from '@/app/api/attendance/checkin/route'
import { POST as checkoutPost } from '@/app/api/attendance/checkout/route'

// ── Helpers ────────────────────────────────────────────────────────────────────

const mockSession = { user: { id: 'user-1', name: 'Employee', role: 'EMPLOYEE', branchId: 'branch-hq' } }

function makeFormReq(url: string, fields: Record<string, string> = {}) {
  const fd = new FormData()
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v))
  return new NextRequest(url, { method: 'POST', body: fd })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/attendance/checkin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await checkinPost(makeFormReq('http://localhost/api/attendance/checkin'))
    expect(res.status).toBe(401)
  })

  it('creates check-in record for authenticated user', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(formHasFaceImage).mockReturnValue(true)

    const mockSettings = {
      id: 'singleton',
      workStartTime: '08:30', lunchStartTime: '12:00', lunchReturnTime: '13:00',
      lateGraceMin: 5, geofenceLat: null, geofenceLng: null, geofenceRadius: 200,
    }
    vi.mocked(prisma.companySettings.findUnique).mockResolvedValue(mockSettings as never)

    const mockUser = { id: 'user-1', name: 'Employee', role: 'EMPLOYEE', branchId: null, branch: null }
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)

    const newRecord = {
      id: 'att-1', userId: 'user-1', date: new Date(), checkIn: new Date(),
      sessionIndex: 1, attendanceStatus: 'active',
    }
    vi.mocked(prisma.attendance.create).mockResolvedValue(newRecord as never)
    vi.mocked(finalizeAttendanceRecord).mockResolvedValue({ id: 'att-1' } as never)

    const res = await checkinPost(
      makeFormReq('http://localhost/api/attendance/checkin', {
        lat: '13.83', lng: '100.68',
        address: 'สำนักงาน', locationType: 'company',
      })
    )
    // Route may return 200 or 201 on success
    expect([200, 201]).toContain(res.status)
  })
})

describe('POST /api/attendance/checkout', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await checkoutPost(makeFormReq('http://localhost/api/attendance/checkout'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when no active check-in session', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    const { findActiveAttendanceSession } = await import('@/lib/attendance-session')
    vi.mocked(findActiveAttendanceSession).mockResolvedValue(null)

    const mockSettings = { id: 'singleton', workStartTime: '08:30', lunchStartTime: '12:00', lunchReturnTime: '13:00', lateGraceMin: 5, geofenceLat: null, geofenceLng: null, geofenceRadius: 200 }
    vi.mocked(prisma.companySettings.findUnique).mockResolvedValue(mockSettings as never)

    const res = await checkoutPost(
      makeFormReq('http://localhost/api/attendance/checkout', { lat: '13.83', lng: '100.68', address: 'สำนักงาน' })
    )
    // 400 = no active session, or 404
    expect([400, 404]).toContain(res.status)
  })
})
