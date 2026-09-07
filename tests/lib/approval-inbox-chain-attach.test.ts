import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  attach: vi.fn(),
  findMany: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/lib/attach-default-chain', () => ({ attachAllPendingDefaultChains: mocks.attach }))
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }))

const prisma = { leaveRequest: { findMany: mocks.findMany } } as unknown as PrismaClient

describe('ensureChainsAttached (exercised via getPendingLeaveForApprover)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules() // fresh module instance per test — chainAttachPromise starts null
    mocks.findMany.mockResolvedValue([])
  })

  it('does not cache a failed attach — the next call retries instead of silently skipping forever', async () => {
    const { getPendingLeaveForApprover } = await import('@/lib/approval-inbox')

    mocks.attach.mockRejectedValueOnce(new Error('DB blip'))
    await getPendingLeaveForApprover(prisma, 'u1', 'CEO')
    expect(mocks.attach).toHaveBeenCalledTimes(1)
    expect(mocks.captureException).toHaveBeenCalledTimes(1)

    mocks.attach.mockResolvedValueOnce(undefined)
    await getPendingLeaveForApprover(prisma, 'u1', 'CEO')
    expect(mocks.attach).toHaveBeenCalledTimes(2) // retried — a real fix would fail this at 1
  })

  it('a successful attach is still memoized — a later call does not re-run it', async () => {
    const { getPendingLeaveForApprover } = await import('@/lib/approval-inbox')

    mocks.attach.mockResolvedValueOnce(undefined)
    await getPendingLeaveForApprover(prisma, 'u1', 'CEO')
    await getPendingLeaveForApprover(prisma, 'u1', 'CEO')
    expect(mocks.attach).toHaveBeenCalledTimes(1) // success path unchanged from before this fix
  })

  it('dedupes concurrent calls into a single in-flight attach attempt', async () => {
    const { getPendingLeaveForApprover } = await import('@/lib/approval-inbox')

    let resolveAttach!: () => void
    mocks.attach.mockReturnValueOnce(new Promise<void>((resolve) => { resolveAttach = resolve }))

    const p1 = getPendingLeaveForApprover(prisma, 'u1', 'CEO')
    const p2 = getPendingLeaveForApprover(prisma, 'u2', 'CEO')
    resolveAttach()
    await Promise.all([p1, p2])

    expect(mocks.attach).toHaveBeenCalledTimes(1)
  })
})
