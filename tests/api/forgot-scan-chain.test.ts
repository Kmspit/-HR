import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  applyToAttendance,
  finalizeForgotScanApproval,
  advanceForgotScanChain,
  executeForgotScanStepAction,
  APPLY_ATTENDANCE_FAILED_MSG,
} from '@/lib/forgot-scan-chain'

vi.mock('@/lib/org-scope', () => ({
  canApproverActOnRequester: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyRole: vi.fn().mockResolvedValue(undefined),
}))

const ACTOR_ID = 'hr-actor-1'
const REQUEST_ID = 'fs-req-1'
const USER_ID = 'emp-1'
const ATT_ID = 'att-1'

function mockForgotScan(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    userId: USER_ID,
    date: new Date('2026-06-01T00:00:00+07:00'),
    scanType: 'checkout',
    correctTime: new Date('2026-06-01T18:00:00+07:00'),
    hrId: null,
    ...overrides,
  }
}

describe('applyToAttendance', () => {
  const mockPrisma = {
    forgotScanRequest: { findUnique: vi.fn(), update: vi.fn() },
    attendance: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  }

  beforeEach(() => vi.clearAllMocks())

  it('returns true and records hrId when attendance row exists', async () => {
    vi.mocked(mockPrisma.forgotScanRequest.findUnique).mockResolvedValue(mockForgotScan() as never)
    vi.mocked(mockPrisma.attendance.findFirst).mockResolvedValue({
      id: ATT_ID,
      checkOut: new Date('2026-06-01T17:00:00+07:00'),
    } as never)
    vi.mocked(mockPrisma.attendance.update).mockResolvedValue({} as never)
    vi.mocked(mockPrisma.forgotScanRequest.update).mockResolvedValue({} as never)

    const ok = await applyToAttendance(REQUEST_ID, mockPrisma as never, { actorId: ACTOR_ID })

    expect(ok).toBe(true)
    expect(mockPrisma.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ editedById: ACTOR_ID }),
      }),
    )
    expect(mockPrisma.forgotScanRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hrId: ACTOR_ID,
          appliedAt: expect.any(Date),
        }),
      }),
    )
  })

  it('returns false when non-checkin and no attendance row', async () => {
    vi.mocked(mockPrisma.forgotScanRequest.findUnique).mockResolvedValue(
      mockForgotScan({ scanType: 'checkout' }) as never,
    )
    vi.mocked(mockPrisma.attendance.findFirst).mockResolvedValue(null)

    const ok = await applyToAttendance(REQUEST_ID, mockPrisma as never, { actorId: ACTOR_ID })

    expect(ok).toBe(false)
    expect(mockPrisma.forgotScanRequest.update).not.toHaveBeenCalled()
  })

  it('creates checkin attendance when missing row', async () => {
    vi.mocked(mockPrisma.forgotScanRequest.findUnique).mockResolvedValue(
      mockForgotScan({ scanType: 'checkin' }) as never,
    )
    vi.mocked(mockPrisma.attendance.findFirst).mockResolvedValue(null)
    vi.mocked(mockPrisma.attendance.create).mockResolvedValue({ id: ATT_ID } as never)
    vi.mocked(mockPrisma.forgotScanRequest.update).mockResolvedValue({} as never)

    const ok = await applyToAttendance(REQUEST_ID, mockPrisma as never, { actorId: ACTOR_ID })

    expect(ok).toBe(true)
    expect(mockPrisma.attendance.create).toHaveBeenCalled()
  })
})

describe('finalizeForgotScanApproval', () => {
  const mockPrisma = {
    forgotScanRequest: { findUnique: vi.fn(), update: vi.fn() },
    attendance: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  }

  beforeEach(() => vi.clearAllMocks())

  it('sets APPROVED only after successful apply', async () => {
    vi.mocked(mockPrisma.forgotScanRequest.findUnique).mockResolvedValue(mockForgotScan() as never)
    vi.mocked(mockPrisma.attendance.findFirst).mockResolvedValue({ id: ATT_ID, checkOut: null } as never)
    vi.mocked(mockPrisma.attendance.update).mockResolvedValue({} as never)
    vi.mocked(mockPrisma.forgotScanRequest.update).mockResolvedValue({} as never)

    await finalizeForgotScanApproval(mockPrisma as never, REQUEST_ID, ACTOR_ID)

    const statusUpdate = vi.mocked(mockPrisma.forgotScanRequest.update).mock.calls.find(
      (c) => (c[0] as { data: { status?: string } }).data?.status === 'APPROVED',
    )
    expect(statusUpdate).toBeDefined()
    expect(statusUpdate![0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          hrId: ACTOR_ID,
          hrAt: expect.any(Date),
        }),
      }),
    )
  })

  it('throws and does not set APPROVED when apply fails', async () => {
    vi.mocked(mockPrisma.forgotScanRequest.findUnique).mockResolvedValue(
      mockForgotScan({ scanType: 'lunch-out' }) as never,
    )
    vi.mocked(mockPrisma.attendance.findFirst).mockResolvedValue(null)

    await expect(
      finalizeForgotScanApproval(mockPrisma as never, REQUEST_ID, ACTOR_ID),
    ).rejects.toThrow(APPLY_ATTENDANCE_FAILED_MSG)

    const approvedCall = vi.mocked(mockPrisma.forgotScanRequest.update).mock.calls.find(
      (c) => (c[0] as { data: { status?: string } }).data?.status === 'APPROVED',
    )
    expect(approvedCall).toBeUndefined()
  })
})

describe('advanceForgotScanChain finalize', () => {
  const mockPrisma = {
    forgotScanRequest: { findUnique: vi.fn(), update: vi.fn() },
    forgotScanApprovalStep: { findFirst: vi.fn() },
    attendance: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    notification: { create: vi.fn() },
  }

  beforeEach(() => vi.clearAllMocks())

  it('returns 422 path via executeForgotScanStepAction when apply fails on final step', async () => {
    const stepPrisma = {
      forgotScanRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: REQUEST_ID,
          status: 'PENDING',
          chainConfigId: 'chain-1',
          currentStepOrder: 2,
          userId: USER_ID,
          scanType: 'checkout',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      forgotScanApprovalStep: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({
            id: 'step-2',
            stepOrder: 2,
            stepName: 'HR',
            approverRole: 'HR',
            approverId: null,
            status: 'PENDING',
          }),
        update: vi.fn().mockResolvedValue({}),
      },
      attendance: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), create: vi.fn() },
    }

    const result = await executeForgotScanStepAction(
      stepPrisma as never,
      REQUEST_ID,
      ACTOR_ID,
      'HR',
      'APPROVE',
      undefined,
      '127.0.0.1',
    )

    expect(result).toEqual(expect.objectContaining({ error: APPLY_ATTENDANCE_FAILED_MSG, status: 422 }))
  })
})

describe('advanceForgotScanChain', () => {
  it('calls finalize with actorId on last step', async () => {
    const mockPrisma = {
      forgotScanRequest: {
        findUnique: vi.fn().mockResolvedValue({
          currentStepOrder: 2,
          chainConfigId: 'chain-1',
          userId: USER_ID,
          scanType: 'checkin',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      forgotScanApprovalStep: { findFirst: vi.fn().mockResolvedValue(null) },
      attendance: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: ATT_ID }),
      },
    }

    const result = await advanceForgotScanChain(mockPrisma as never, REQUEST_ID, ACTOR_ID)

    expect(result.finalized).toBe(true)
    expect(mockPrisma.forgotScanRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', hrId: ACTOR_ID }),
      }),
    )
  })
})
