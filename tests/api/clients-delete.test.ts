import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateManyTask: vi.fn().mockResolvedValue({ count: 0 }),
  updateManyDoc: vi.fn().mockResolvedValue({ count: 0 }),
  deleteManyOverride: vi.fn().mockResolvedValue({ count: 0 }),
  userDelete: vi.fn().mockResolvedValue({ id: 'client-1' }),
  transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.findUnique, delete: mocks.userDelete },
    taskAssignment: { updateMany: mocks.updateManyTask },
    caseDocument: { updateMany: mocks.updateManyDoc },
    pagePermissionOverride: { deleteMany: mocks.deleteManyOverride },
    $transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

import { auth } from '@/lib/auth'
import { DELETE } from '@/app/api/clients/[id]/route'

const hrSession = { user: { id: 'hr-1', role: 'MANAGER_HR' } }
const params = (id: string) => ({ params: Promise.resolve({ id }) })

function makeReq() {
  return new NextRequest('http://localhost/api/clients/client-1', { method: 'DELETE' })
}

describe('DELETE /api/clients/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation((ops: unknown[]) => Promise.all(ops))
  })

  it('401 unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await DELETE(makeReq(), params('client-1'))
    expect(res.status).toBe(401)
  })

  it('403 for a role outside SUPER_ADMIN/CEO/MANAGER_HR/HR', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } } as any)
    const res = await DELETE(makeReq(), params('client-1'))
    expect(res.status).toBe(403)
  })

  it('404 when the target is not a CLIENT-role user', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    mocks.findUnique.mockResolvedValue(null)
    const res = await DELETE(makeReq(), params('client-1'))
    expect(res.status).toBe(404)
  })

  /**
   * 2026-10-06 security review finding — this is a SECOND user-deletion
   * path besides scripts/purge-user.mjs, which already cleans up
   * page_permission_overrides. page_permission_overrides has no real FK
   * (same gap class documented in purge-user.mjs), so deleting a CLIENT
   * user here without this would silently orphan any override row
   * referencing them, either as the override's target (userId) or its
   * creator (createdById — never realistic for a CLIENT in practice, since
   * only SUPER_ADMIN/CEO/MANAGER_HR can create one, but cleaned up
   * defensively anyway per the exact request).
   */
  it('deletes page_permission_overrides (both as target and as creator) in the SAME transaction as the user delete', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    mocks.findUnique.mockResolvedValue({ id: 'client-1', role: 'CLIENT' })

    const res = await DELETE(makeReq(), params('client-1'))

    expect(res.status).toBe(200)
    expect(mocks.deleteManyOverride).toHaveBeenCalledWith({
      where: { OR: [{ userId: 'client-1' }, { createdById: 'client-1' }] },
    })
    expect(mocks.userDelete).toHaveBeenCalledWith({ where: { id: 'client-1' } })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    // Both the override cleanup and the user delete must be inside the SAME
    // $transaction call, not two separate top-level prisma calls.
    const txArgs = mocks.transaction.mock.calls[0][0]
    expect(Array.isArray(txArgs)).toBe(true)
    expect(txArgs).toHaveLength(2)
  })

  it('still unlinks tasks and documents before the transaction (unchanged pre-existing behavior)', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    mocks.findUnique.mockResolvedValue({ id: 'client-1', role: 'CLIENT' })

    await DELETE(makeReq(), params('client-1'))

    expect(mocks.updateManyTask).toHaveBeenCalledWith({ where: { clientId: 'client-1' }, data: { clientId: null } })
    expect(mocks.updateManyDoc).toHaveBeenCalledWith({ where: { clientId: 'client-1' }, data: { clientId: null } })
  })
})
