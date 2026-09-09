import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/face-attendance', () => ({
  isAttendanceFaceAction: (a: string) => ['checkin', 'checkout', 'lunch-out', 'lunch-in'].includes(a),
  shouldRequireFaceVerification: vi.fn(),
  verifyFaceForAttendance: vi.fn(),
}))

vi.mock('@/lib/attendance-line-notify', () => ({
  notifyHrFaceMismatchOnLine: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/access-log', () => ({
  logAccessDenied: vi.fn(),
}))

import { shouldRequireFaceVerification, verifyFaceForAttendance } from '@/lib/face-attendance'
import { guardAttendanceFace } from '@/lib/face-checkin-guard'

function formDataWithMethod(method: string) {
  const fd = new FormData()
  fd.set('attendanceMethod', method)
  return fd
}

describe('guardAttendanceFace — uses the consent-aware gate, not raw profile existence', () => {
  beforeEach(() => vi.clearAllMocks())

  it('blocks method=manual with FACE_REQUIRED when face verification is currently required', async () => {
    vi.mocked(shouldRequireFaceVerification).mockResolvedValue(true)

    const res = await guardAttendanceFace('u1', formDataWithMethod('manual'), 'checkin')

    expect(res).not.toBeNull()
    const body = await res!.json()
    expect(body.code).toBe('FACE_REQUIRED')
    expect(verifyFaceForAttendance).not.toHaveBeenCalled()
  })

  it('allows method=manual through to verifyFaceForAttendance when face verification is not required (revoked/expired consent)', async () => {
    vi.mocked(shouldRequireFaceVerification).mockResolvedValue(false)
    vi.mocked(verifyFaceForAttendance).mockResolvedValue({ ok: true, logId: 'log-1', distance: null, manual: true, confidence: null } as never)

    const res = await guardAttendanceFace('u1', formDataWithMethod('manual'), 'checkin')

    expect(res).toBeNull()
    expect(verifyFaceForAttendance).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', method: 'manual' }))
  })
})
