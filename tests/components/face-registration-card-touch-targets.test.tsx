// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/client-api', () => ({
  apiJson: vi.fn().mockResolvedValue({ ok: true, data: {}, status: 200 }),
  apiErrorMessage: vi.fn().mockReturnValue('error'),
}))
vi.mock('@/lib/face-client', () => ({
  loadFaceModels: vi.fn().mockResolvedValue(undefined),
  scanFaceFromVideo: vi.fn().mockResolvedValue(null),
  captureJpegFromVideo: vi.fn(),
}))

const mockUseCameraStream = vi.fn()
vi.mock('@/hooks/useCameraStream', () => ({
  useCameraStream: (...args: unknown[]) => mockUseCameraStream(...args),
  attachStreamToVideo: vi.fn().mockResolvedValue(undefined),
}))

import FaceRegistrationCard from '@/components/attendance/FaceRegistrationCard'

afterEach(() => cleanup())

/**
 * Mobile audit fix (2026-09-22, group 3) — 5 secondary buttons in the face
 * registration flow were 32-40px, below the ~44px touch-target guideline.
 * Fix adds min-h-[44px] without changing any behavior.
 */
describe('FaceRegistrationCard — secondary buttons meet the 44px touch-target guideline', () => {
  it('camera-phase "ย้อนกลับ"/"เริ่มสแกนอัตโนมัติ" buttons are min-h-[44px]', () => {
    mockUseCameraStream.mockReturnValue({ stream: null, ready: true, error: null, retry: vi.fn(), stage: 'ready', stop: vi.fn(), start: vi.fn() })
    render(<FaceRegistrationCard onRegistered={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /เริ่มสแกนจดจำใบหน้า/ }))

    const backBtn = screen.getByRole('button', { name: 'ย้อนกลับ' })
    const startBtn = screen.getByRole('button', { name: 'เริ่มสแกนอัตโนมัติ' })
    expect(backBtn.className).toContain('min-h-[44px]')
    expect(startBtn.className).toContain('min-h-[44px]')
  })

  it('camera-error "ลองเปิดกล้องอีกครั้ง" retry button is min-h-[44px]', () => {
    mockUseCameraStream.mockReturnValue({ stream: null, ready: false, error: 'เปิดกล้องไม่สำเร็จ', retry: vi.fn(), stage: 'error', stop: vi.fn(), start: vi.fn() })
    render(<FaceRegistrationCard onRegistered={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /เริ่มสแกนจดจำใบหน้า/ }))

    const retryBtn = screen.getByRole('button', { name: /ลองเปิดกล้องอีกครั้ง/ })
    expect(retryBtn.className).toContain('min-h-[44px]')
  })

  it('scan-phase "เริ่มใหม่" reset button is min-h-[44px]', () => {
    mockUseCameraStream.mockReturnValue({ stream: null, ready: true, error: null, retry: vi.fn(), stage: 'ready', stop: vi.fn(), start: vi.fn() })
    render(<FaceRegistrationCard onRegistered={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /เริ่มสแกนจดจำใบหน้า/ }))
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มสแกนอัตโนมัติ' }))

    const resetBtn = screen.getByRole('button', { name: 'เริ่มใหม่' })
    expect(resetBtn.className).toContain('min-h-[44px]')
  })

  // NOTE: the scan-error retry button ("เริ่มใหม่" shown when scanError is
  // set) is not covered by a render test here — scanError is only ever set
  // from inside the scan loop's catch branch, which requires a real video
  // frame (videoRef.current.videoWidth > 0) that jsdom can't produce without
  // the optional `canvas` npm package (not installed in this project).
  // Verified by code review only: the fix is the exact same one-token
  // min-h-[44px] addition already confirmed working on the 3 buttons above.
})
