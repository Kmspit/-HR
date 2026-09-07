import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  transaction: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    automationRule: { findMany: mocks.findMany, update: vi.fn().mockReturnValue({}) },
    automationExecutionLog: { create: vi.fn().mockReturnValue({}) },
    $transaction: mocks.transaction,
  },
}))
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }))

import { triggerAutomation } from '@/lib/automation-engine'

describe('triggerAutomation — failures are reported instead of silently dropped', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not throw and reports to Sentry when the rule query itself fails', async () => {
    const dbError = new Error('DB not ready')
    mocks.findMany.mockRejectedValue(dbError)

    await expect(triggerAutomation('COURT_MISSED', {}, 'user-1')).resolves.toBeUndefined()

    expect(mocks.captureException).toHaveBeenCalledWith(dbError, expect.objectContaining({ tags: expect.objectContaining({ trigger: 'COURT_MISSED' }) }))
  })

  it('does not throw and reports to Sentry when writing the execution log fails (rule still ran)', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'rule-1', name: 'test rule', conditions: '[]', actions: '[]', testMode: true, priority: 0 },
    ])
    const logError = new Error('log write failed')
    mocks.transaction.mockRejectedValue(logError)

    await expect(triggerAutomation('COURT_MISSED', {}, 'user-1')).resolves.toBeUndefined()

    expect(mocks.captureException).toHaveBeenCalledWith(
      logError,
      expect.objectContaining({ tags: expect.objectContaining({ trigger: 'COURT_MISSED', ruleId: 'rule-1' }) }),
    )
  })
})
