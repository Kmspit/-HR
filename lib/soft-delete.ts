import { createAuditLog } from '@/lib/notifications'

/** Spread into a Prisma `where` to exclude soft-deleted rows: `{ ...notDeleted, ... }`. */
export const notDeleted = { deletedAt: null } as const

export type SoftDeleteAuditContext = {
  actorId: string
  targetId: string
  targetType: string
  ip: string
  userAgent?: string
}

export type SoftDeleteResult = { ok: true } | { ok: false; error: string }

/**
 * Shared control flow for soft-deleting a row: refuse if already deleted, atomically
 * set deletedAt/deletedById (the `updateMany` callback must include `deletedAt: null`
 * in its own `where` — same race guard as the existing Debtor/OutsideWorkRequest
 * soft-delete routes this mirrors), then write a DELETE audit log entry.
 *
 * Takes the actual Prisma call as a callback instead of a model name so this stays
 * usable across models without fighting Prisma's per-model generated types — the
 * caller keeps full type safety on its own `prisma.<model>.updateMany(...)` call.
 */
export async function softDelete(params: {
  /** The row's current deletedAt, read just before calling this. */
  currentDeletedAt: Date | null | undefined
  /** Must perform `prisma.<model>.updateMany({ where: { id, deletedAt: null }, data: { deletedAt, deletedById } })`. */
  updateMany: (data: { deletedAt: Date; deletedById: string }) => Promise<{ count: number }>
  audit: SoftDeleteAuditContext
}): Promise<SoftDeleteResult> {
  if (params.currentDeletedAt) {
    return { ok: false, error: 'รายการนี้ถูกลบไปแล้ว' }
  }

  const deletedAt = new Date()
  const result = await params.updateMany({ deletedAt, deletedById: params.audit.actorId })
  if (result.count === 0) {
    // Lost the race — someone else deleted it between the read and this write.
    return { ok: false, error: 'รายการนี้ถูกลบไปแล้ว' }
  }

  await createAuditLog({
    actorId: params.audit.actorId,
    targetId: params.audit.targetId,
    targetType: params.audit.targetType,
    action: 'DELETE',
    before: { deletedAt: null },
    after: { deletedAt: deletedAt.toISOString() },
    ip: params.audit.ip,
    userAgent: params.audit.userAgent,
  })

  return { ok: true }
}

/**
 * Shared control flow for restoring a soft-deleted row: refuse if not currently
 * deleted, clear deletedAt/deletedById, then write an UPDATE audit log entry
 * recording the restore.
 */
export async function restoreSoftDeleted(params: {
  currentDeletedAt: Date | null | undefined
  /** Must perform `prisma.<model>.update({ where: { id }, data: { deletedAt: null, deletedById: null } })`. */
  update: (data: { deletedAt: null; deletedById: null }) => Promise<unknown>
  audit: SoftDeleteAuditContext
}): Promise<SoftDeleteResult> {
  if (!params.currentDeletedAt) {
    return { ok: false, error: 'รายการนี้ไม่ได้ถูกลบ' }
  }

  await params.update({ deletedAt: null, deletedById: null })

  await createAuditLog({
    actorId: params.audit.actorId,
    targetId: params.audit.targetId,
    targetType: params.audit.targetType,
    action: 'UPDATE',
    before: { deletedAt: params.currentDeletedAt.toISOString() },
    after: { deletedAt: null },
    ip: params.audit.ip,
    userAgent: params.audit.userAgent,
  })

  return { ok: true }
}
