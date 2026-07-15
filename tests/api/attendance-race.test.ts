import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { clearCompanySettingsCache } from '@/lib/company-settings-cache'

// ── Mocks (same conventions as tests/api/attendance.test.ts) ────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    attendance: {
      updateMany: vi.fn(),
    },
    companySettings: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    attendanceFaceLog: { update: vi.fn().mockReturnValue({ catch: vi.fn() }) },
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
  formHasFaceImage: vi.fn().mockReturnValue(true),
  imageBufferFromForm: vi.fn().mockResolvedValue(null),
  recordFaceScanAndNotifyHr: vi.fn().mockResolvedValue(null),
  syncAttendancePhotoFromFaceScan: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/attendance-work-log', () => ({
  finalizeAttendanceRecord: vi.fn().mockResolvedValue({ id: 'att-1', isOutside: false }),
  getDayOfWeekIndex: vi.fn().mockReturnValue(1),
}))

vi.mock('@/lib/attendance-leave-sync', () => ({
  findApprovedLeaveOnDate: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/attendance-session', () => ({
  findActiveAttendanceSession: vi.fn(),
}))

vi.mock('@/lib/utils', () => ({
  parseCoord: (v: unknown) => (v ? parseFloat(String(v)) : null),
  startOfTodayLocal: () => new Date(),
}))

vi.mock('@/lib/datetime-bangkok', () => ({
  bangkokDateKey: () => '2026-06-23',
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: vi.fn() }
})

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findActiveAttendanceSession } from '@/lib/attendance-session'
import { finalizeAttendanceRecord } from '@/lib/attendance-work-log'
import { POST as checkoutPost } from '@/app/api/attendance/checkout/route'
import { POST as lunchPost } from '@/app/api/attendance/lunch/route'

const mockSession = { user: { id: 'user-1', name: 'Employee', role: 'EMPLOYEE', branchId: 'branch-hq' } }

const activeSession = {
  id: 'att-1',
  userId: 'user-1',
  checkIn: new Date('2026-06-23T02:00:00Z'),
  checkOut: null,
  lunchOut: null,
  lunchIn: null,
}

function makeFormReq(url: string, fields: Record<string, string> = {}) {
  const fd = new FormData()
  fd.append('lat', '13.83')
  fd.append('lng', '100.68')
  fd.append('address', 'สำนักงาน')
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v))
  return new NextRequest(url, { method: 'POST', body: fd })
}

describe('POST /api/attendance/checkout — atomic race guard (Phase A item 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCompanySettingsCache()
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(findActiveAttendanceSession).mockResolvedValue(activeSession as never)
    vi.mocked(prisma.companySettings.findUnique).mockResolvedValue({
      id: 'singleton', workEndTime: '17:30',
    } as never)
  })

  it('writes via updateMany with a where-guard on checkOut:null, not a plain update', async () => {
    vi.mocked(prisma.attendance.updateMany).mockResolvedValue({ count: 1 } as never)
    const res = await checkoutPost(makeFormReq('http://localhost/api/attendance/checkout'))
    expect(res.status).toBe(200)
    expect(prisma.attendance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'att-1', checkOut: null }) }),
    )
  })

  it('rejects the loser of a concurrent double-checkout with 409, and never finalizes', async () => {
    vi.mocked(prisma.attendance.updateMany).mockResolvedValue({ count: 0 } as never)
    const res = await checkoutPost(makeFormReq('http://localhost/api/attendance/checkout'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('ALREADY_CHECKOUT')
    expect(finalizeAttendanceRecord).not.toHaveBeenCalled()
  })
})

describe('POST /api/attendance/lunch (lunch-out) — atomic race guard (Phase A item 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCompanySettingsCache()
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(findActiveAttendanceSession).mockResolvedValue(activeSession as never)
  })

  it('writes via updateMany with a where-guard on lunchOut:null', async () => {
    vi.mocked(prisma.attendance.updateMany).mockResolvedValue({ count: 1 } as never)
    const res = await lunchPost(makeFormReq('http://localhost/api/attendance/lunch', { action: 'lunch-out' }))
    expect(res.status).toBe(200)
    expect(prisma.attendance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'att-1', lunchOut: null }) }),
    )
  })

  it('rejects a concurrent double lunch-out with 409, and never finalizes', async () => {
    vi.mocked(prisma.attendance.updateMany).mockResolvedValue({ count: 0 } as never)
    const res = await lunchPost(makeFormReq('http://localhost/api/attendance/lunch', { action: 'lunch-out' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('ALREADY_LUNCH_OUT')
    expect(finalizeAttendanceRecord).not.toHaveBeenCalled()
  })
})

describe('POST /api/attendance/lunch (lunch-in) — atomic race guard (Phase A item 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCompanySettingsCache()
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(findActiveAttendanceSession).mockResolvedValue({
      ...activeSession,
      lunchOut: new Date('2026-06-23T05:00:00Z'),
    } as never)
    vi.mocked(prisma.companySettings.findUnique).mockResolvedValue({
      id: 'singleton', lunchReturnTime: '13:00',
    } as never)
  })

  it('writes via updateMany with a where-guard on lunchIn:null', async () => {
    vi.mocked(prisma.attendance.updateMany).mockResolvedValue({ count: 1 } as never)
    const res = await lunchPost(makeFormReq('http://localhost/api/attendance/lunch', { action: 'lunch-in' }))
    expect(res.status).toBe(200)
    expect(prisma.attendance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'att-1', lunchIn: null }) }),
    )
  })

  it('rejects a concurrent double lunch-in with 409, and never finalizes', async () => {
    vi.mocked(prisma.attendance.updateMany).mockResolvedValue({ count: 0 } as never)
    const res = await lunchPost(makeFormReq('http://localhost/api/attendance/lunch', { action: 'lunch-in' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('ALREADY_LUNCH_IN')
    expect(finalizeAttendanceRecord).not.toHaveBeenCalled()
  })
})
