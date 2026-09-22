// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/face-client', () => ({
  loadFaceModels: vi.fn().mockResolvedValue(undefined),
  scanFaceFromVideo: vi.fn().mockResolvedValue(null),
  captureJpegFromVideo: vi.fn(),
  countDetectedFaces: vi.fn().mockResolvedValue(0),
}))

vi.mock('@/lib/face-liveness', () => ({
  scoreLivenessSamples: vi.fn(),
  serializeSpoofFlags: vi.fn().mockReturnValue(''),
  sampleVideoLuminance: vi.fn().mockReturnValue(100),
}))

vi.mock('@/lib/client-api', () => ({
  apiJson: vi.fn(),
  apiErrorMessage: vi.fn().mockReturnValue('error'),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockUseCameraStream = vi.fn()
vi.mock('@/hooks/useCameraStream', () => ({
  useCameraStream: (...args: unknown[]) => mockUseCameraStream(...args),
  attachStreamToVideo: vi.fn().mockResolvedValue(undefined),
}))

import FaceAttendanceScan from '@/components/attendance/FaceAttendanceScan'

afterEach(() => cleanup())

/**
 * Mobile audit fix (2026-09-22, group 3) — several secondary buttons in the
 * daily face-scan flow (the single highest-frequency mobile interaction in
 * the app) were 32-40px, below the ~44px touch-target guideline, and they're
 * exactly the buttons a user has to hit when the flow has ALREADY gone
 * wrong (camera failure, cancel) — the worst possible moment for a
 * hard-to-tap button. Fix adds min-h-[44px] (and h-11 w-11 for the circular
 * icon buttons) without changing any behavior.
 */
describe('FaceAttendanceScan — secondary buttons meet the 44px touch-target guideline', () => {
  it('camera-error retry/cancel buttons are min-h-[44px]', () => {
    mockUseCameraStream.mockReturnValue({ stream: null, ready: false, error: 'เปิดกล้องไม่สำเร็จ', retry: vi.fn(), stage: 'error', stop: vi.fn(), start: vi.fn() })
    render(<FaceAttendanceScan action="checkin" onVerified={vi.fn()} onCancel={vi.fn()} />)

    const retryBtn = screen.getByRole('button', { name: /ลองเปิดกล้องอีกครั้ง/ })
    const cancelBtn = screen.getByRole('button', { name: 'ยกเลิก' })
    expect(retryBtn.className).toContain('min-h-[44px]')
    expect(cancelBtn.className).toContain('min-h-[44px]')
  })

  it('the fullscreen camera-view "X" cancel button is h-11 w-11 (44px), not h-10 w-10 (40px)', () => {
    mockUseCameraStream.mockReturnValue({ stream: {}, ready: true, error: null, retry: vi.fn(), stage: 'ready', stop: vi.fn(), start: vi.fn() })
    render(<FaceAttendanceScan action="checkin" onVerified={vi.fn()} onCancel={vi.fn()} />)

    const cancelBtn = screen.getByRole('button', { name: 'ยกเลิก' })
    expect(cancelBtn.className).toContain('h-11')
    expect(cancelBtn.className).toContain('w-11')
    expect(cancelBtn.className).not.toContain('h-10')
  })
})
