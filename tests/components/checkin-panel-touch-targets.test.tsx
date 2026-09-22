// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/client-api', () => ({
  apiJson: vi.fn().mockResolvedValue({ ok: true, data: {}, status: 200 }),
  apiErrorMessage: vi.fn().mockReturnValue('error'),
}))

const mockUseCameraStream = vi.fn()
vi.mock('@/hooks/useCameraStream', () => ({
  useCameraStream: (...args: unknown[]) => mockUseCameraStream(...args),
  attachStreamToVideo: vi.fn().mockResolvedValue(undefined),
}))
mockUseCameraStream.mockReturnValue({ stream: null, ready: false, error: null, retry: vi.fn(), stage: 'idle', stop: vi.fn(), start: vi.fn() })

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

import CheckInPanel from '@/components/attendance/CheckInPanel'

afterEach(() => cleanup())

/**
 * Mobile audit fix (2026-09-22, group 3) — 3 secondary buttons in the daily
 * check-in flow were 40px, below the ~44px touch-target guideline: the
 * geofence-retry button (hit right after GPS rejects the user's location —
 * an already-frustrating moment), the camera-retry button, and the "ถ่ายใหม่"
 * retake button. Fix adds min-h-[44px] without changing any behavior.
 */
describe('CheckInPanel — secondary buttons meet the 44px touch-target guideline', () => {
  it('the geofence "ตรวจสอบตำแหน่งอีกครั้ง" retry button is min-h-[44px]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({}) }))
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      geolocation: {
        getCurrentPosition: (success: PositionCallback) => {
          success({ coords: { latitude: 13.9, longitude: 100.9, accuracy: 10 } } as GeolocationPosition)
        },
      },
    })

    render(
      <CheckInPanel
        type="checkin"
        locationType="company"
        companyOffice={{ name: 'สำนักงานใหญ่', address: 'กรุงเทพฯ' }}
        companyGeofence={{ name: 'สำนักงานใหญ่', address: 'กรุงเทพฯ', lat: 13.7563, lng: 100.5018, radiusM: 200 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/ }))
    fireEvent.click(await screen.findByRole('button', { name: /ระบุตำแหน่ง GPS/ }))

    const retryBtn = await screen.findByRole('button', { name: /ตรวจสอบตำแหน่งอีกครั้ง/ })
    expect(retryBtn.className).toContain('min-h-[44px]')

    vi.unstubAllGlobals()
  })

  it('the camera "ลองเปิดกล้องอีกครั้ง" retry button is min-h-[44px]', async () => {
    mockUseCameraStream.mockReturnValue({ stream: null, ready: false, error: 'เปิดกล้องไม่สำเร็จ', retry: vi.fn(), stage: 'error', stop: vi.fn(), start: vi.fn() })

    // type=lunch-out with faceRequired=false starts directly on the 'camera' step.
    render(<CheckInPanel type="lunch-out" faceRequired={false} />)

    const retryBtn = await screen.findByRole('button', { name: /ลองเปิดกล้องอีกครั้ง/ })
    expect(retryBtn.className).toContain('min-h-[44px]')
  })

  // NOTE: the "ถ่ายใหม่" retake button (confirm step) is not covered by a
  // render test here — reaching the confirm step requires a real captured
  // photo, which needs canvas.getContext('2d') + a non-zero video frame
  // (jsdom has neither without the optional `canvas` npm package, not
  // installed in this project). Verified by code review only: the fix is
  // the exact same one-token min-h-[44px] addition already confirmed
  // working on the two buttons tested above in this same file.
})
