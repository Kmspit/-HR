import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { createAuditLog } from '@/lib/notifications'
import { softDelete, restoreSoftDeleted, notDeleted } from '@/lib/soft-delete'

describe('notDeleted', () => {
  it('is a deletedAt: null where-fragment', () => {
    expect(notDeleted).toEqual({ deletedAt: null })
  })
})

describe('softDelete', () => {
  beforeEach(() => vi.clearAllMocks())

  const audit = { actorId: 'admin-1', targetId: 'target-1', targetType: 'Payroll', ip: '127.0.0.1' }

  it('refuses when already deleted', async () => {
    const updateMany = vi.fn()
    const result = await softDelete({
      currentDeletedAt: new Date('2026-01-01'),
      updateMany,
      audit,
    })

    expect(result).toEqual({ ok: false, error: 'รายการนี้ถูกลบไปแล้ว' })
    expect(updateMany).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('marks deletedAt/deletedById and writes a DELETE audit log', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const result = await softDelete({
      currentDeletedAt: null,
      updateMany,
      audit,
    })

    expect(result).toEqual({ ok: true })
    expect(updateMany).toHaveBeenCalledTimes(1)
    const call = updateMany.mock.calls[0][0]
    expect(call.deletedById).toBe('admin-1')
    expect(call.deletedAt).toBeInstanceOf(Date)

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        targetId: 'target-1',
        targetType: 'Payroll',
        action: 'DELETE',
        before: { deletedAt: null },
      }),
    )
  })

  it('reports failure when updateMany affects 0 rows (lost the race)', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    const result = await softDelete({
      currentDeletedAt: null,
      updateMany,
      audit,
    })

    expect(result).toEqual({ ok: false, error: 'รายการนี้ถูกลบไปแล้ว' })
    expect(createAuditLog).not.toHaveBeenCalled()
  })
})

describe('restoreSoftDeleted', () => {
  beforeEach(() => vi.clearAllMocks())

  const audit = { actorId: 'admin-1', targetId: 'target-1', targetType: 'Payroll', ip: '127.0.0.1' }

  it('refuses when not currently deleted', async () => {
    const update = vi.fn()
    const result = await restoreSoftDeleted({
      currentDeletedAt: null,
      update,
      audit,
    })

    expect(result).toEqual({ ok: false, error: 'รายการนี้ไม่ได้ถูกลบ' })
    expect(update).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('clears deletedAt/deletedById and writes an UPDATE audit log', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const deletedAt = new Date('2026-01-01')
    const result = await restoreSoftDeleted({
      currentDeletedAt: deletedAt,
      update,
      audit,
    })

    expect(result).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ deletedAt: null, deletedById: null })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        targetId: 'target-1',
        targetType: 'Payroll',
        action: 'UPDATE',
        before: { deletedAt: deletedAt.toISOString() },
        after: { deletedAt: null },
      }),
    )
  })
})
