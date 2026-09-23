import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    attendance: { findUnique: vi.fn() },
    attendanceFaceScan: { findMany: vi.fn().mockResolvedValue([]) },
    outsideWorkRequest: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/org-scope', () => ({ canViewUserRecord: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/attendance/[id]/route'

const mockSession = { user: { id: 'user-1', role: 'EMPLOYEE', branchId: null } }

function fullRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-1', userId: 'user-1', date: new Date('2026-06-05'), sessionIndex: 1,
    checkIn: new Date('2026-06-05T09:00:00'), checkOut: new Date('2026-06-05T18:00:00'),
    lunchOut: null, lunchIn: null,
    status: 'NORMAL', lateMinutes: 0, earlyLeaveMinutes: 0, isOutside: false,
    workPlaceName: 'HQ', address: 'BKK',
    checkInLat: 13.75, checkInLng: 100.5, checkInAddress: 'BKK',
    checkOutLat: null, checkOutLng: null, checkOutAddress: null,
    lat: 13.75, lng: 100.5,
    autoCheckout: false, note: null, gpsAccuracy: 5,
    photoUrl: null, checkOutPhotoUrl: null, lunchOutPhotoUrl: null, lunchInPhotoUrl: null,
    outsideWorkRequestId: null,
    user: { name: 'พนักงาน หนึ่ง', department: 'ฝ่ายบุคคล', employeeId: 'E001' },
    branch: { name: 'สำนักงานใหญ่', address: 'BKK' },
    ...overrides,
  }
}

/**
 * 2026-09-23 (Group 2, CONTRIBUTING.md explicit-select rule) — this route's
 * findUnique used `include` (still full-selects the base Attendance columns)
 * with no top-level `select`. Pins down the response shape is unchanged and
 * that the new select includes every field the JSON response reads.
 */
describe('GET /api/attendance/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the full field set the response body reads, unchanged', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(fullRecord() as never)

    const res = await GET(new Request('http://localhost/api/attendance/att-1'), { params: Promise.resolve({ id: 'att-1' }) })
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.id).toBe('att-1')
    expect(data.status).toBe('NORMAL')
    expect(data.checkInLat).toBe(13.75)
    expect(data.user).toEqual({ name: 'พนักงาน หนึ่ง', department: 'ฝ่ายบุคคล', employeeId: 'E001' })
    expect(data.branch).toEqual({ name: 'สำนักงานใหญ่', address: 'BKK' })
  })

  it('the findUnique select includes every field the JSON response reads, plus userId/outsideWorkRequestId', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(fullRecord() as never)

    await GET(new Request('http://localhost/api/attendance/att-1'), { params: Promise.resolve({ id: 'att-1' }) })

    const call = vi.mocked(prisma.attendance.findUnique).mock.calls[0][0] as { select: Record<string, unknown> }
    for (const field of [
      'id', 'userId', 'date', 'sessionIndex', 'checkIn', 'checkOut', 'lunchOut', 'lunchIn',
      'status', 'lateMinutes', 'earlyLeaveMinutes', 'isOutside', 'workPlaceName', 'address',
      'checkInLat', 'checkInLng', 'checkInAddress', 'checkOutLat', 'checkOutLng', 'checkOutAddress',
      'lat', 'lng', 'autoCheckout', 'note', 'gpsAccuracy',
      'photoUrl', 'checkOutPhotoUrl', 'lunchOutPhotoUrl', 'lunchInPhotoUrl', 'outsideWorkRequestId',
    ]) {
      expect(call.select[field], `expected select to include "${field}"`).toBe(true)
    }
    expect(call.select.user).toBeTruthy()
    expect(call.select.branch).toBeTruthy()
  })

  it('returns 404 when the record does not exist', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(null as never)

    const res = await GET(new Request('http://localhost/api/attendance/missing'), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })
})
