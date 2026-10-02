// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const { mockApiJson } = vi.hoisted(() => ({ mockApiJson: vi.fn() }))
vi.mock('@/lib/client-api', () => ({
  apiJson: mockApiJson,
  apiErrorMessage: (data: Record<string, unknown>, fallback: string) =>
    (typeof data?.error === 'string' && data.error) || fallback,
}))

import ForgotScanClient from '@/app/(dashboard)/forgot-scan/ForgotScanClient'

afterEach(() => cleanup())
beforeEach(() => mockApiJson.mockReset())

const baseRequest = {
  id: 'r1', userId: 'u1', date: '2026-10-01', scanType: 'checkin' as const,
  correctTime: '08:30', reason: 'ลืมสแกน', evidenceUrl: null,
  chainConfigId: null, supervisorId: null, supervisorNote: null, supervisorAt: null,
  hrId: null, hrNote: null, hrAt: null, originalTime: null, attendanceId: null,
  appliedAt: null, createdAt: '2026-10-01T00:00:00.000Z',
  user: { id: 'u1', name: 'ทดสอบ ระบบ', employeeId: null, department: null },
  supervisorRel: null, hrRel: null,
}

/**
 * 2026-10-02 bug-scan round 2, finding #2: StatusBadge() had the exact
 * "(HR)"/"(หัวหน้า)" parenthetical pattern as the original roleBadge() bug
 * ("ผู้บริหาร (CEO)") — no whitespace-nowrap.
 *
 * jsdom has no real layout engine, so this asserts the fix at the only
 * level jsdom can verify (the class is present) — the real wrap-vs-no-wrap
 * behavior was verified separately with a real headless-Chromium render at
 * a forced-narrow column width, reproducing both the bug and the fix.
 */
describe('ForgotScanClient.tsx StatusBadge()', () => {
  it('"ปฏิเสธ (HR)" badge — the exact "(HR)"/"(หัวหน้า)" parenthetical pattern — carries whitespace-nowrap', async () => {
    mockApiJson.mockResolvedValue({
      ok: true,
      data: { requests: [{ ...baseRequest, status: 'ADMIN_REJECTED' }] },
    })

    render(<ForgotScanClient userId="u1" userName="ทดสอบ ระบบ" role="EMPLOYEE" isSupervisor={false} isHR={false} />)

    await waitFor(() => expect(screen.getByText('ปฏิเสธ (HR)')).toBeTruthy())
    const badge = screen.getByText('ปฏิเสธ (HR)')
    expect(badge.className).toContain('whitespace-nowrap')
  })
})
