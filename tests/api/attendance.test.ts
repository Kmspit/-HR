import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { clearCompanySettingsCache } from '@/lib/company-settings-cache'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    attendance: {
      create:     vi.fn(),
      findFirst:  vi.fn(),
      findMany:   vi.fn(),
      update:     vi.fn(),
      updateMany: vi.fn(),
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
  assertDeviceAllowed: vi.fn().mockResolvedValue({ ok: true }),
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
  SHARED_LOCATION_TOLERANCE_METERS: 500,
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
import { haversineDistanceMeters } from '@/lib/gps-fence'
import { findApprovedOutsideWorkForDate } from '@/lib/outside-work'
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
  beforeEach(() => { vi.clearAllMocks(); clearCompanySettingsCache() })

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

  describe('lateness (computeCheckInLateness extraction, 2026-09-23)', () => {
    // bangkokDateKey is mocked to '2026-06-23' above — fake the wall clock to a
    // known time on that same date so the workStartTime+lateGraceMin deadline
    // comparison inside the route is deterministic, not dependent on when the
    // test suite happens to run.
    afterEach(() => vi.useRealTimers())

    function setUpCheckinMocks() {
      vi.mocked(auth).mockResolvedValue(mockSession as never)
      vi.mocked(formHasFaceImage).mockReturnValue(true)
      vi.mocked(prisma.companySettings.findUnique).mockResolvedValue({
        id: 'singleton',
        workStartTime: '08:30', lunchStartTime: '12:00', lunchReturnTime: '13:00',
        lateGraceMin: 5, geofenceLat: null, geofenceLng: null, geofenceRadius: 200,
      } as never)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        { id: 'user-1', name: 'Employee', role: 'EMPLOYEE', branchId: null, branch: null } as never,
      )
      vi.mocked(prisma.attendance.create).mockResolvedValue({
        id: 'att-1', userId: 'user-1', date: new Date(), checkIn: new Date(), sessionIndex: 1,
      } as never)
      vi.mocked(finalizeAttendanceRecord).mockResolvedValue({ id: 'att-1' } as never)
    }

    it('is on-time (lateMinutes: 0) checking in before the grace-period deadline (08:35)', async () => {
      setUpCheckinMocks()
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-23T08:20:00+07:00'))

      const res = await checkinPost(
        makeFormReq('http://localhost/api/attendance/checkin', { lat: '13.83', lng: '100.68', address: 'สำนักงาน', locationType: 'company' }),
      )
      expect([200, 201]).toContain(res.status)
      const data = await res.json()
      expect(data.lateMinutes).toBe(0)
      expect(vi.mocked(prisma.attendance.create).mock.calls[0][0]).toMatchObject({
        data: expect.objectContaining({ status: 'NORMAL', lateMinutes: 0 }),
      })
    })

    it('is LATE with the correct minute count checking in past the grace-period deadline', async () => {
      setUpCheckinMocks()
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-23T09:05:00+07:00')) // 30 min past the 08:35 deadline

      const res = await checkinPost(
        makeFormReq('http://localhost/api/attendance/checkin', { lat: '13.83', lng: '100.68', address: 'สำนักงาน', locationType: 'company' }),
      )
      expect([200, 201]).toContain(res.status)
      const data = await res.json()
      expect(data.lateMinutes).toBe(30)
      expect(vi.mocked(prisma.attendance.create).mock.calls[0][0]).toMatchObject({
        data: expect.objectContaining({ status: 'LATE', lateMinutes: 30 }),
      })
    })
  })

  describe('outside-work GPS check (OutsideWorkRequest.lat/lng)', () => {
    function setUpOutsideCheckinMocks() {
      vi.mocked(auth).mockResolvedValue(mockSession as never)
      vi.mocked(formHasFaceImage).mockReturnValue(true)
      vi.mocked(prisma.companySettings.findUnique).mockResolvedValue({
        id: 'singleton',
        workStartTime: '08:30', lunchStartTime: '12:00', lunchReturnTime: '13:00',
        lateGraceMin: 5, geofenceLat: null, geofenceLng: null, geofenceRadius: 200,
      } as never)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        { id: 'user-1', name: 'Employee', role: 'EMPLOYEE', branchId: null, branch: null } as never,
      )
      vi.mocked(prisma.attendance.create).mockResolvedValue({
        id: 'att-1', userId: 'user-1', date: new Date(), checkIn: new Date(), sessionIndex: 1,
      } as never)
      vi.mocked(finalizeAttendanceRecord).mockResolvedValue({ id: 'att-1' } as never)
    }

    const outsideFormFields = {
      lat: '13.999', lng: '100.999', address: 'ที่ลูกค้า', locationType: 'outside',
    }

    it('locationStatus="matched" when within the shared tolerance', async () => {
      setUpOutsideCheckinMocks()
      vi.mocked(findApprovedOutsideWorkForDate).mockResolvedValue({
        id: 'ow-1', place: 'บริษัทลูกค้า A', startTime: '09:00', endTime: '17:00', date: new Date(),
        lat: 13.75, lng: 100.50,
      } as never)
      vi.mocked(haversineDistanceMeters).mockReturnValue(100) // within 500m tolerance

      const res = await checkinPost(makeFormReq('http://localhost/api/attendance/checkin', outsideFormFields))
      expect([200, 201]).toContain(res.status)
      const data = await res.json()
      expect(data.locationStatus).toBe('matched')
      expect(data.plannedPlace).toBe('บริษัทลูกค้า A')
      expect(data.weeklyPlanWarning).toBeNull()
    })

    it('locationStatus="mismatch" with source-aware wording (ใบขออนุมัตินอกสถานที่, not แผนงาน) when beyond tolerance', async () => {
      setUpOutsideCheckinMocks()
      vi.mocked(findApprovedOutsideWorkForDate).mockResolvedValue({
        id: 'ow-1', place: 'บริษัทลูกค้า A', startTime: '09:00', endTime: '17:00', date: new Date(),
        lat: 13.75, lng: 100.50,
      } as never)
      vi.mocked(haversineDistanceMeters).mockReturnValue(900) // beyond 500m tolerance

      const res = await checkinPost(makeFormReq('http://localhost/api/attendance/checkin', outsideFormFields))
      expect([200, 201]).toContain(res.status)
      const data = await res.json()
      expect(data.locationStatus).toBe('mismatch')
      expect(data.locationDistance).toBe(900)
      expect(data.weeklyPlanWarning).toContain('ใบขออนุมัตินอกสถานที่')
      expect(data.weeklyPlanWarning).not.toContain('แผนงาน')
      expect(data.weeklyPlanWarning).toContain('บริษัทลูกค้า A')
    })

    it('an approved OutsideWorkRequest with no coordinates (old record) falls back to locationStatus="no_plan", unchanged from before', async () => {
      setUpOutsideCheckinMocks()
      vi.mocked(findApprovedOutsideWorkForDate).mockResolvedValue({
        id: 'ow-2', place: 'บริษัทลูกค้า B', startTime: '09:00', endTime: '17:00', date: new Date(),
        lat: null, lng: null,
      } as never)

      const res = await checkinPost(makeFormReq('http://localhost/api/attendance/checkin', outsideFormFields))
      expect([200, 201]).toContain(res.status)
      const data = await res.json()
      expect(data.locationStatus).toBe('no_plan')
      expect(data.weeklyPlanWarning).toBeNull()
      expect(haversineDistanceMeters).not.toHaveBeenCalled()
    })
  })
})

describe('POST /api/attendance/checkout', () => {
  beforeEach(() => { vi.clearAllMocks(); clearCompanySettingsCache() })

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

  describe('early-leave (computeCheckOutEarlyLeave extraction, 2026-09-23)', () => {
    afterEach(() => vi.useRealTimers())

    async function setUpCheckoutMocks() {
      vi.mocked(auth).mockResolvedValue(mockSession as never)
      vi.mocked(formHasFaceImage).mockReturnValue(true)
      const { findActiveAttendanceSession } = await import('@/lib/attendance-session')
      vi.mocked(findActiveAttendanceSession).mockResolvedValue({
        id: 'att-1', userId: 'user-1', status: 'NORMAL', checkIn: new Date('2026-06-23T08:20:00+07:00'), checkOut: null,
      } as never)
      vi.mocked(prisma.companySettings.findUnique).mockResolvedValue({
        id: 'singleton', workStartTime: '08:30', workEndTime: '17:00',
        lunchStartTime: '12:00', lunchReturnTime: '13:00', lateGraceMin: 5,
        geofenceLat: null, geofenceLng: null, geofenceRadius: 200,
      } as never)
      vi.mocked(prisma.attendance.updateMany).mockResolvedValue({ count: 1 } as never)
      vi.mocked(finalizeAttendanceRecord).mockResolvedValue({ id: 'att-1', lateMinutes: 0, lunchOverMinutes: 0 } as never)
    }

    it('is NORMAL (earlyLeaveMinutes: 0) checking out at/after workEndTime (17:00)', async () => {
      await setUpCheckoutMocks()
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-23T17:05:00+07:00'))

      const res = await checkoutPost(
        makeFormReq('http://localhost/api/attendance/checkout', { lat: '13.83', lng: '100.68', address: 'สำนักงาน' }),
      )
      expect([200, 201]).toContain(res.status)
      const data = await res.json()
      expect(data.earlyLeaveMinutes).toBe(0)
      expect(vi.mocked(prisma.attendance.updateMany).mock.calls[0][0]).toMatchObject({
        data: expect.objectContaining({ status: 'NORMAL', earlyLeaveMinutes: 0 }),
      })
    })

    it('is EARLY_LEAVE with the correct minute count checking out before workEndTime', async () => {
      await setUpCheckoutMocks()
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-23T16:30:00+07:00')) // 30 min before 17:00

      const res = await checkoutPost(
        makeFormReq('http://localhost/api/attendance/checkout', { lat: '13.83', lng: '100.68', address: 'สำนักงาน' }),
      )
      expect([200, 201]).toContain(res.status)
      const data = await res.json()
      expect(data.earlyLeaveMinutes).toBe(30)
      expect(vi.mocked(prisma.attendance.updateMany).mock.calls[0][0]).toMatchObject({
        data: expect.objectContaining({ status: 'EARLY_LEAVE', earlyLeaveMinutes: 30 }),
      })
    })
  })
})
