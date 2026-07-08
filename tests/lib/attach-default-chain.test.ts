import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
// attachDefaultChainForOutside delegates entirely to applyChainToOutsideWork
// for setting status/approvalStatus — mock the chain-application functions so
// we can assert the wrapper does NOT perform any extra write of its own.

const applyChainToOutsideWork = vi.fn().mockResolvedValue(undefined)
const getDefaultChain = vi.fn()
vi.mock('@/lib/approval-chain', () => ({
  getDefaultChain: (...a: unknown[]) => getDefaultChain(...a),
  applyChainToOutsideWork: (...a: unknown[]) => applyChainToOutsideWork(...a),
  applyChainToLeave: vi.fn(),
}))

vi.mock('@/lib/weekly-plan-chain', () => ({ applyChainToWeeklyPlan: vi.fn() }))
vi.mock('@/lib/forgot-scan-chain', () => ({ applyChainToForgotScan: vi.fn() }))

import { attachDefaultChainForOutside } from '@/lib/attach-default-chain'

function makeFakePrisma(overrides: { chainConfigId?: string | null } = {}) {
  const update = vi.fn().mockResolvedValue({ id: 'req-1' })
  return {
    prisma: {
      outsideWorkRequest: {
        findUnique: vi.fn().mockResolvedValue({ chainConfigId: overrides.chainConfigId ?? null }),
        update,
      },
    } as never,
    update,
  }
}

describe('attachDefaultChainForOutside — does not clobber approvalStatus after applyChainToOutsideWork', () => {
  beforeEach(() => vi.clearAllMocks())

  it('never writes approvalStatus itself — delegates entirely to applyChainToOutsideWork (auto-finalized APPROVED case stays APPROVED)', async () => {
    getDefaultChain.mockResolvedValue({ id: 'chain-1' })
    const { prisma, update } = makeFakePrisma()

    const attached = await attachDefaultChainForOutside(prisma, 'req-1', 'user-1')

    expect(attached).toBe(true)
    expect(applyChainToOutsideWork).toHaveBeenCalledWith(prisma, 'req-1', 'chain-1', 'user-1')
    // The regression: this used to always fire a second update forcing
    // approvalStatus back to 'pending_chain', even when applyChainToOutsideWork
    // had just finalized the request to APPROVED. There must be none now.
    expect(update).not.toHaveBeenCalled()
  })

  it('returns false without calling applyChainToOutsideWork when the request already has a chain', async () => {
    getDefaultChain.mockResolvedValue({ id: 'chain-1' })
    const { prisma, update } = makeFakePrisma({ chainConfigId: 'already-has-one' })

    const attached = await attachDefaultChainForOutside(prisma, 'req-1', 'user-1')

    expect(attached).toBe(false)
    expect(applyChainToOutsideWork).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('returns false without side effects when no default OUTSIDE_WORK chain is configured', async () => {
    getDefaultChain.mockResolvedValue(null)
    const { prisma, update } = makeFakePrisma()

    const attached = await attachDefaultChainForOutside(prisma, 'req-1', 'user-1')

    expect(attached).toBe(false)
    expect(applyChainToOutsideWork).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
