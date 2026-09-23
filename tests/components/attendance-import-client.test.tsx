// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const { mockApiJson } = vi.hoisted(() => {
  const mockApiJson = vi.fn()
  return { mockApiJson }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/client-api', () => ({
  apiJson: mockApiJson,
  apiErrorMessage: (data: Record<string, unknown>, fallback: string) =>
    (typeof data?.error === 'string' && data.error) || fallback,
}))

import AttendanceImportClient from '@/components/attendance/AttendanceImportClient'

afterEach(() => cleanup())
beforeEach(() => mockApiJson.mockReset())

function smallXlsxFile(name = 'import.xlsx') {
  return new File(['dummy xlsx content'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function bigXlsxFile(name = 'big.xlsx') {
  return new File([new Uint8Array(2 * 1024 * 1024 + 1)], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const el = container.querySelector('input[type="file"]')
  if (!el) throw new Error('file input not found')
  return el as HTMLInputElement
}

function computedRow(overrides: Record<string, unknown> = {}) {
  return {
    rowNumber: 2,
    userId: 'u1',
    employeeName: 'สมชาย ใจดี',
    date: '2026-09-19T17:00:00.000Z',
    checkIn: '2026-09-20T01:57:00.000Z',
    checkOut: '2026-09-20T10:30:00.000Z',
    lunchOut: null,
    lunchIn: null,
    lateMinutes: 22,
    earlyLeaveMinutes: 0,
    workMinutes: 500,
    status: 'LATE',
    ...overrides,
  }
}

describe('AttendanceImportClient', () => {
  it('shows a client-side error for a file over 2MB and never calls the preview API', () => {
    const { container } = render(<AttendanceImportClient />)
    fireEvent.change(fileInput(container), { target: { files: [bigXlsxFile()] } })

    expect(screen.getByText(/ไฟล์ใหญ่เกิน 2MB/)).toBeTruthy()
    const previewButton = screen.getByRole('button', { name: /ตรวจสอบไฟล์/ }) as HTMLButtonElement
    expect(previewButton.disabled).toBe(true)
    expect(mockApiJson).not.toHaveBeenCalled()
  })

  it('previews a valid file and renders the toCreate/skipped summary + deduction table', async () => {
    mockApiJson.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        fileName: 'import.xlsx',
        totalRows: 2,
        toCreate: [computedRow()],
        skipped: [{ rowNumber: 3, employeeCell: 'ไม่มีตัวตน (NOPE)', reason: 'ไม่พบพนักงานที่มีรหัส "NOPE" ในระบบ' }],
        estimatedDeductionByEmployee: [
          { userId: 'u1', employeeName: 'สมชาย ใจดี', lateDays: 1, billableLateMinutes: 22, estimatedDeduction: 45.83 },
        ],
        totalEstimatedDeduction: 45.83,
      },
    })

    const { container } = render(<AttendanceImportClient />)
    fireEvent.change(fileInput(container), { target: { files: [smallXlsxFile()] } })
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบไฟล์/ }))

    await screen.findByText('2. ตรวจสอบก่อนยืนยัน')

    expect(mockApiJson).toHaveBeenCalledWith('/api/attendance/import/preview', expect.objectContaining({ method: 'POST' }))
    const [, previewInit] = mockApiJson.mock.calls[0]
    expect(previewInit.body).toBeInstanceOf(FormData)

    expect(screen.getByText('ไม่มีตัวตน (NOPE)')).toBeTruthy()
    expect(screen.getByText(/ไม่พบพนักงานที่มีรหัส/)).toBeTruthy()
    expect(screen.getByText('สมชาย ใจดี')).toBeTruthy()
    expect(screen.getAllByText(/45\.83/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /ยืนยันนำเข้า 1 รายการ/ })).toBeTruthy()
  })

  it('confirms in ≤200-row chunks, carrying batchId forward and setting isLastChunk only on the final chunk', async () => {
    const toCreate = Array.from({ length: 250 }, (_, i) => computedRow({ rowNumber: i + 2 }))
    mockApiJson.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { fileName: 'import.xlsx', totalRows: 250, toCreate, skipped: [], estimatedDeductionByEmployee: [], totalEstimatedDeduction: 0 },
    })
    mockApiJson.mockResolvedValueOnce({
      ok: true, status: 200,
      data: { batchId: 'batch-1', chunkCreated: 200, chunkSkipped: [], totalCreatedSoFar: 200, totalSkippedSoFar: 0 },
    })
    mockApiJson.mockResolvedValueOnce({
      ok: true, status: 200,
      data: { batchId: 'batch-1', chunkCreated: 50, chunkSkipped: [], totalCreatedSoFar: 250, totalSkippedSoFar: 0 },
    })

    const { container } = render(<AttendanceImportClient />)
    fireEvent.change(fileInput(container), { target: { files: [smallXlsxFile()] } })
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบไฟล์/ }))
    await screen.findByRole('button', { name: /ยืนยันนำเข้า 250 รายการ/ })

    fireEvent.click(screen.getByRole('button', { name: /ยืนยันนำเข้า 250 รายการ/ }))

    await screen.findByText('นำเข้าเสร็จสิ้น')
    expect(screen.getByText(/สร้างข้อมูลลงเวลาใหม่ 250 รายการ/)).toBeTruthy()

    const confirmCalls = mockApiJson.mock.calls.filter(([url]) => url === '/api/attendance/import/confirm')
    expect(confirmCalls).toHaveLength(2)

    const firstBody = JSON.parse(confirmCalls[0][1].body)
    expect(firstBody.batchId).toBeUndefined()
    expect(firstBody.isLastChunk).toBe(false)
    expect(firstBody.rows).toHaveLength(200)

    const secondBody = JSON.parse(confirmCalls[1][1].body)
    expect(secondBody.batchId).toBe('batch-1')
    expect(secondBody.isLastChunk).toBe(true)
    expect(secondBody.rows).toHaveLength(50)
  })

  it('shows a confirm-time error and stops (does not claim success) when a chunk request fails', async () => {
    mockApiJson.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { fileName: 'import.xlsx', totalRows: 1, toCreate: [computedRow()], skipped: [], estimatedDeductionByEmployee: [], totalEstimatedDeduction: 0 },
    })
    mockApiJson.mockResolvedValueOnce({
      ok: false,
      status: 500,
      data: { error: 'เขียนข้อมูลไม่สำเร็จ' },
    })

    const { container } = render(<AttendanceImportClient />)
    fireEvent.change(fileInput(container), { target: { files: [smallXlsxFile()] } })
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบไฟล์/ }))
    await screen.findByRole('button', { name: /ยืนยันนำเข้า 1 รายการ/ })

    fireEvent.click(screen.getByRole('button', { name: /ยืนยันนำเข้า 1 รายการ/ }))

    await waitFor(() => expect(screen.getByText(/เขียนข้อมูลไม่สำเร็จ/)).toBeTruthy())
    expect(screen.queryByText('นำเข้าเสร็จสิ้น')).toBeNull()
  })
})
