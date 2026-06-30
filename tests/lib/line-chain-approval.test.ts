import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  formatLineChainActionError,
  runLineChainApproval,
  LINE_NOT_YOUR_TURN_MSG,
  LINE_USE_APP_MSG,
} from '@/lib/line-chain-approval'

vi.mock('@/lib/approval-chain', () => ({
  executeLeaveStepAction: vi.fn(),
  executeOutsideWorkStepAction: vi.fn(),
}))

vi.mock('@/lib/forgot-scan-chain', () => ({
  executeForgotScanStepAction: vi.fn(),
}))

import { executeLeaveStepAction, executeOutsideWorkStepAction } from '@/lib/approval-chain'
import { executeForgotScanStepAction } from '@/lib/forgot-scan-chain'

describe('formatLineChainActionError', () => {
  it('maps 403 to not-your-turn message', () => {
    expect(formatLineChainActionError({ error: 'คุณไม่มีสิทธิ์อนุมัติขั้นนี้', status: 403 }))
      .toBe(LINE_NOT_YOUR_TURN_MSG)
  })

  it('maps NO_CHAIN to use-app message', () => {
    expect(formatLineChainActionError({ error: 'USE_LEGACY_APPROVAL', status: 409 }))
      .toBe(LINE_USE_APP_MSG)
  })

  it('passes through other errors', () => {
    expect(formatLineChainActionError({ error: 'ไม่พบคำขอ', status: 404 }))
      .toBe('ไม่พบคำขอ')
  })
})

describe('runLineChainApproval', () => {
  const mockPrisma = {
    leaveRequest: { findUnique: vi.fn() },
    outsideWorkRequest: { findUnique: vi.fn() },
    forgotScanRequest: { findUnique: vi.fn() },
    approvalHistory: { create: vi.fn().mockResolvedValue({}) },
  }

  beforeEach(() => vi.clearAllMocks())

  it('calls executeLeaveStepAction for chain leave', async () => {
    vi.mocked(mockPrisma.leaveRequest.findUnique).mockResolvedValue({
      id: 'l1',
      status: 'PENDING',
      chainConfigId: 'chain-1',
    } as never)
    vi.mocked(executeLeaveStepAction).mockResolvedValue({
      success: true,
      action: 'APPROVE',
      finalized: false,
      nextStepOrder: 2,
      stepName: 'HR',
    })

    const result = await runLineChainApproval(
      mockPrisma as never,
      'LEAVE',
      'l1',
      'tl-1',
      'TEAM_LEADER',
      'APPROVE',
    )

    expect(result).toEqual(expect.objectContaining({ ok: true, stepName: 'HR' }))
    expect(executeLeaveStepAction).toHaveBeenCalledWith(
      mockPrisma,
      'l1',
      'tl-1',
      'TEAM_LEADER',
      'APPROVE',
      undefined,
      'line-webhook',
    )
  })

  it('returns not-your-turn when leave step rejects actor', async () => {
    vi.mocked(mockPrisma.leaveRequest.findUnique).mockResolvedValue({
      id: 'l1',
      status: 'PENDING',
      chainConfigId: 'chain-1',
    } as never)
    vi.mocked(executeLeaveStepAction).mockResolvedValue({
      error: 'คุณไม่มีสิทธิ์อนุมัติขั้นนี้',
      status: 403,
    })

    const result = await runLineChainApproval(
      mockPrisma as never,
      'LEAVE',
      'l1',
      'emp-1',
      'EMPLOYEE',
      'APPROVE',
    )

    expect(result).toEqual({ ok: false, message: LINE_NOT_YOUR_TURN_MSG })
  })

  it('calls executeOutsideWorkStepAction for chain outside work', async () => {
    vi.mocked(mockPrisma.outsideWorkRequest.findUnique).mockResolvedValue({
      id: 'ow1',
      status: 'PENDING',
      chainConfigId: 'chain-1',
      approvalStatus: 'pending_chain',
      currentStepOrder: 1,
    } as never)
    vi.mocked(executeOutsideWorkStepAction).mockResolvedValue({
      success: true,
      action: 'APPROVE',
      finalized: true,
      nextStepOrder: null,
      stepName: 'หัวหน้า',
    })

    const result = await runLineChainApproval(
      mockPrisma as never,
      'OUTSIDE',
      'ow1',
      'mgr-1',
      'MANAGER',
      'APPROVE',
    )

    expect(result).toEqual(expect.objectContaining({ ok: true, stepName: 'หัวหน้า' }))
    expect(executeOutsideWorkStepAction).toHaveBeenCalled()
    expect(mockPrisma.approvalHistory.create).toHaveBeenCalled()
  })

  it('rejects outside without pending_chain', async () => {
    vi.mocked(mockPrisma.outsideWorkRequest.findUnique).mockResolvedValue({
      id: 'ow1',
      status: 'PENDING',
      chainConfigId: null,
      approvalStatus: null,
    } as never)

    const result = await runLineChainApproval(
      mockPrisma as never,
      'OUTSIDE',
      'ow1',
      'mgr-1',
      'MANAGER',
      'APPROVE',
    )

    expect(result).toEqual({ ok: false, message: LINE_USE_APP_MSG })
    expect(executeOutsideWorkStepAction).not.toHaveBeenCalled()
  })

  it('calls executeForgotScanStepAction for chain forgot-scan', async () => {
    vi.mocked(mockPrisma.forgotScanRequest.findUnique).mockResolvedValue({
      id: 'fs1',
      status: 'PENDING',
      chainConfigId: 'chain-1',
    } as never)
    vi.mocked(executeForgotScanStepAction).mockResolvedValue({
      success: true,
      action: 'APPROVE',
      finalized: false,
      nextStepOrder: 2,
      stepName: 'HR อนุมัติ',
    })

    const result = await runLineChainApproval(
      mockPrisma as never,
      'FORGOT_SCAN',
      'fs1',
      'hr-1',
      'HR',
      'APPROVE',
    )

    expect(result).toEqual(expect.objectContaining({ ok: true, stepName: 'HR อนุมัติ' }))
    expect(executeForgotScanStepAction).toHaveBeenCalledWith(
      mockPrisma,
      'fs1',
      'hr-1',
      'HR',
      'APPROVE',
      undefined,
      'line-webhook',
    )
  })
})
