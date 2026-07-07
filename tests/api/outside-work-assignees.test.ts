import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── In-memory fake "outside_work_assignees" table ───────────────────────────
// Backs the mocked prisma.outsideWorkAssignee.* calls so tests can verify the
// actual resulting DB state after a write (not just the HTTP response JSON).
type AssigneeRow = { outsideWorkRequestId: string; userId: string }
let assigneeStore: AssigneeRow[] = []

const USER_NAMES: Record<string, string> = {
  'user-a': 'Alpha User',
  'user-b': 'Bravo User',
  'user-c': 'Charlie User',
}

// Prisma's real method types (fluent client wrappers, exact arg shapes) are
// far stricter than a hand-rolled fake needs to satisfy — cast through
// `unknown` at the mock boundary rather than fighting them field-by-field.
function mockImpl(fn: unknown, impl: (...args: any[]) => any) {
  ;(fn as { mockImplementation: (impl: (...args: any[]) => any) => void }).mockImplementation(impl)
}

function assigneesFor(requestId: string) {
  return assigneeStore
    .filter((r) => r.outsideWorkRequestId === requestId)
    .map((r) => ({ user: { id: r.userId, name: USER_NAMES[r.userId] ?? r.userId } }))
}

// ── Fake branch-scoped user directory for /api/outside-work/employees ──────
const ALL_USERS = [
  { id: 'u-a1', name: 'Employee A1', department: 'Sales', status: 'ACTIVE',   branchId: 'branch-a' },
  { id: 'u-a2', name: 'Employee A2', department: 'Sales', status: 'ACTIVE',   branchId: 'branch-a' },
  { id: 'u-b1', name: 'Employee B1', department: 'Ops',   status: 'ACTIVE',   branchId: 'branch-b' },
  { id: 'u-a3-inactive', name: 'Inactive A3', department: 'Sales', status: 'DISABLED', branchId: 'branch-a' },
]

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    outsideWorkRequest: {
      create:           vi.fn(),
      findMany:         vi.fn().mockResolvedValue([]),
      findUnique:       vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update:           vi.fn(),
    },
    outsideWorkAssignee: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany:   vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/notifications', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  notifyRole:     vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/access-control', () => ({
  hasPermission: vi.fn((role: string, perm: string) => {
    if (perm === 'approve_outside_work') return ['CEO', 'HR', 'MANAGER_HR'].includes(role)
    return false
  }),
}))

vi.mock('@/lib/approval-chain', () => ({
  getDefaultChain: vi.fn().mockResolvedValue({
    id: 'chain-ow-1', entityType: 'OUTSIDE_WORK', steps: [],
  }),
  applyChainToOutsideWork: vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ───────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/outside-work/route'
import { PATCH } from '@/app/api/outside-work/[id]/route'
import { GET as employeesGET } from '@/app/api/outside-work/employees/route'

// ── Sessions ─────────────────────────────────────────────────────────────────

const empSession      = { user: { id: 'emp-1',      name: 'Employee',   role: 'EMPLOYEE', branchId: 'branch-a' } }
const otherEmpSession = { user: { id: 'other-emp',  name: 'Other',      role: 'EMPLOYEE', branchId: 'branch-a' } }
const hrSession        = { user: { id: 'hr-1',       name: 'HR Admin',   role: 'CEO',      branchId: null } }
const adminSession     = { user: { id: 'admin-1',    name: 'Admin',      role: 'ADMIN',    branchId: null } }

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePost(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/outside-work', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePatch(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/outside-work/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeGet(url: string) {
  return new NextRequest(url)
}

const validCreatePayload = {
  date: '2026-06-23', startTime: '09:00', endTime: '17:00',
  place: 'ศาลจังหวัด', purpose: 'ยื่นฟ้อง',
}

const existingPendingOwnedByEmp1 = {
  userId: 'emp-1', status: 'PENDING', approvalStatus: null, place: 'ที่เดิม', note: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  assigneeStore = []

  // Fake DB behaviour for outsideWorkAssignee.* — mirrors the real
  // @@unique([outsideWorkRequestId, userId]) constraint so tests can prove
  // duplicate-pair inserts are actually rejected, not just "assumed".
  mockImpl(prisma.outsideWorkAssignee.deleteMany, async ({ where }: any) => {
    const before = assigneeStore.length
    assigneeStore = assigneeStore.filter((r) => r.outsideWorkRequestId !== where.outsideWorkRequestId)
    return { count: before - assigneeStore.length }
  })

  mockImpl(prisma.outsideWorkAssignee.createMany, async ({ data }: any) => {
    const rows: AssigneeRow[] = Array.isArray(data) ? data : [data]
    for (const row of rows) {
      const dup = assigneeStore.some(
        (r) => r.outsideWorkRequestId === row.outsideWorkRequestId && r.userId === row.userId,
      )
      if (dup) {
        throw new Error(
          'Unique constraint failed on the fields: (`outside_work_request_id`,`user_id`)',
        )
      }
      assigneeStore.push({ outsideWorkRequestId: row.outsideWorkRequestId, userId: row.userId })
    }
    return { count: rows.length }
  })

  mockImpl(prisma.outsideWorkAssignee.findMany, async ({ where }: any) => {
    return assigneeStore.filter((r) => r.outsideWorkRequestId === where.outsideWorkRequestId)
  })

  // $transaction([...]) — the ops array is built by *calling* each prisma
  // method beforehand (each fake mutates assigneeStore synchronously, see
  // above), so by the time $transaction runs the array already holds
  // resolved values; Promise.all faithfully replays that here.
  mockImpl(prisma.$transaction, async (ops: any) => Promise.all(ops))
})

// ════════════════════════════════════════════════════════════════════════════
// 1) GET /api/outside-work/employees
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/outside-work/employees', () => {
  beforeEach(() => {
    mockImpl(prisma.user.findMany, async ({ where }: any) => {
      return ALL_USERS.filter((u) =>
        (where.status === undefined || u.status === where.status) &&
        (where.branchId === undefined || u.branchId === where.branchId),
      ).map((u) => ({ id: u.id, name: u.name, department: u.department }))
    })
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await employeesGET(makeGet('http://localhost/api/outside-work/employees'))
    expect(res.status).toBe(401)
  })

  it('scopes an EMPLOYEE to their own branch only — never sees other branches', async () => {
    vi.mocked(auth).mockResolvedValue(empSession as any)
    const res = await employeesGET(makeGet('http://localhost/api/outside-work/employees'))
    expect(res.status).toBe(200)
    const data = await res.json()
    const ids = data.employees.map((e: any) => e.id)
    expect(ids).toEqual(expect.arrayContaining(['u-a1', 'u-a2']))
    expect(ids).not.toContain('u-b1')          // other branch — must not leak
    expect(ids).not.toContain('u-a3-inactive') // inactive — must not appear
  })

  it('lets a company-wide role (ADMIN) see employees across branches', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as any)
    const res = await employeesGET(makeGet('http://localhost/api/outside-work/employees'))
    expect(res.status).toBe(200)
    const data = await res.json()
    const ids = data.employees.map((e: any) => e.id)
    expect(ids).toEqual(expect.arrayContaining(['u-a1', 'u-a2', 'u-b1']))
    expect(ids).not.toContain('u-a3-inactive') // still excludes inactive regardless of role
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 2) POST /api/outside-work — create with assigneeIds
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/outside-work — assigneeIds', () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(empSession as any)
    vi.mocked(prisma.outsideWorkRequest.create).mockResolvedValue({ id: 'req-1' } as any)
    mockImpl(prisma.outsideWorkRequest.findUnique, async () => ({
      id: 'req-1', userId: 'emp-1', place: validCreatePayload.place, note: null,
      assignees: assigneesFor('req-1'),
    }))
  })

  it('creates the request and attaches every assignee sent', async () => {
    const res = await POST(makePost({ ...validCreatePayload, assigneeIds: ['user-a', 'user-b'] }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.request.assignees).toHaveLength(2)
    expect(data.request.assignees.map((a: any) => a.user.id).sort()).toEqual(['user-a', 'user-b'])

    // Verify against the fake DB directly, not just the HTTP response.
    const stored = await prisma.outsideWorkAssignee.findMany({ where: { outsideWorkRequestId: 'req-1' } } as any)
    expect(stored).toHaveLength(2)
  })

  it('creates the request with assigneeIds: [] — succeeds with no assignees, no error', async () => {
    const res = await POST(makePost({ ...validCreatePayload, assigneeIds: [] }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.request.assignees).toEqual([])
    expect(prisma.outsideWorkAssignee.createMany).not.toHaveBeenCalled()
  })

  it('dedupes a repeated userId within the same array before insert (no unique-constraint error)', async () => {
    const res = await POST(makePost({
      ...validCreatePayload, assigneeIds: ['user-a', 'user-a', 'user-b'],
    }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)

    expect(prisma.outsideWorkAssignee.createMany).toHaveBeenCalledTimes(1)
    const call = vi.mocked(prisma.outsideWorkAssignee.createMany).mock.calls[0][0] as any
    expect(call.data).toHaveLength(2)
    expect(call.data.map((d: any) => d.userId).sort()).toEqual(['user-a', 'user-b'])

    const stored = await prisma.outsideWorkAssignee.findMany({ where: { outsideWorkRequestId: 'req-1' } } as any)
    expect(stored).toHaveLength(2)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 3) PATCH /api/outside-work/[id] — replace assigneeIds via transaction
// ════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/outside-work/[id] — assigneeIds', () => {
  const params = Promise.resolve({ id: 'req-1' })

  function mockFindUniqueOrThrowFromStore() {
    mockImpl(prisma.outsideWorkRequest.findUniqueOrThrow, async ({ where }: any) => ({
      id: where.id, userId: 'emp-1', place: 'ที่เดิม', note: null,
      assignees: assigneesFor(where.id),
    }))
  }

  beforeEach(() => {
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue(existingPendingOwnedByEmp1 as any)
    mockImpl(prisma.outsideWorkRequest.update, async ({ where, select }: any) => {
      if (select && (select as any).assignees) {
        return { id: where.id, place: 'ที่เดิม', note: null, assignees: assigneesFor(where.id) }
      }
      return { id: where.id }
    })
    mockFindUniqueOrThrowFromStore()
  })

  it('replaces 2 assignees with 1 — the removed assignee is truly gone from the store, not just absent from the response', async () => {
    vi.mocked(auth).mockResolvedValue(empSession as any)
    assigneeStore = [
      { outsideWorkRequestId: 'req-1', userId: 'user-a' },
      { outsideWorkRequestId: 'req-1', userId: 'user-b' },
    ]

    const res = await PATCH(makePatch('req-1', { assigneeIds: ['user-a'] }), { params })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.request.assignees.map((a: any) => a.user.id)).toEqual(['user-a'])

    // Independent DB-level check (not derived from the HTTP response).
    const stored = await prisma.outsideWorkAssignee.findMany({ where: { outsideWorkRequestId: 'req-1' } } as any)
    expect(stored.map((r: any) => r.userId)).toEqual(['user-a'])
    expect(stored.map((r: any) => r.userId)).not.toContain('user-b')
  })

  it('assigneeIds: [] clears every assignee', async () => {
    vi.mocked(auth).mockResolvedValue(empSession as any)
    assigneeStore = [
      { outsideWorkRequestId: 'req-1', userId: 'user-a' },
      { outsideWorkRequestId: 'req-1', userId: 'user-b' },
    ]

    const res = await PATCH(makePatch('req-1', { assigneeIds: [] }), { params })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.request.assignees).toEqual([])

    const stored = await prisma.outsideWorkAssignee.findMany({ where: { outsideWorkRequestId: 'req-1' } } as any)
    expect(stored).toEqual([])
  })

  it('omitting assigneeIds entirely leaves existing assignees untouched (distinct from sending [])', async () => {
    vi.mocked(auth).mockResolvedValue(empSession as any)
    assigneeStore = [
      { outsideWorkRequestId: 'req-1', userId: 'user-a' },
      { outsideWorkRequestId: 'req-1', userId: 'user-b' },
    ]

    const res = await PATCH(makePatch('req-1', { note: 'อัปเดตหมายเหตุ' }), { params })
    expect(res.status).toBe(200)

    // No transaction, no delete/create — the assignee table is never touched.
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.outsideWorkAssignee.deleteMany).not.toHaveBeenCalled()
    expect(prisma.outsideWorkAssignee.createMany).not.toHaveBeenCalled()

    const stored = await prisma.outsideWorkAssignee.findMany({ where: { outsideWorkRequestId: 'req-1' } } as any)
    expect(stored.map((r: any) => r.userId).sort()).toEqual(['user-a', 'user-b'])
  })

  it('forbids a non-owner, non-HR user from changing another user\'s assigneeIds', async () => {
    vi.mocked(auth).mockResolvedValue(otherEmpSession as any)
    assigneeStore = [{ outsideWorkRequestId: 'req-1', userId: 'user-a' }]

    const res = await PATCH(makePatch('req-1', { assigneeIds: ['user-c'] }), { params })
    expect(res.status).toBe(403)

    // Rejected before any write was attempted.
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.outsideWorkAssignee.deleteMany).not.toHaveBeenCalled()
    expect(prisma.outsideWorkAssignee.createMany).not.toHaveBeenCalled()

    const stored = await prisma.outsideWorkAssignee.findMany({ where: { outsideWorkRequestId: 'req-1' } } as any)
    expect(stored.map((r: any) => r.userId)).toEqual(['user-a']) // unchanged
  })

  it('allows HR (in scope) to replace assigneeIds even though they are not the owner', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as any)
    assigneeStore = [{ outsideWorkRequestId: 'req-1', userId: 'user-a' }]

    const res = await PATCH(makePatch('req-1', { assigneeIds: ['user-b', 'user-c'] }), { params })
    expect(res.status).toBe(200)

    const stored = await prisma.outsideWorkAssignee.findMany({ where: { outsideWorkRequestId: 'req-1' } } as any)
    expect(stored.map((r: any) => r.userId).sort()).toEqual(['user-b', 'user-c'])
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 4) Unique constraint on (outsideWorkRequestId, userId)
// ════════════════════════════════════════════════════════════════════════════

describe('OutsideWorkAssignee unique constraint', () => {
  it('the fake store rejects a direct duplicate-pair insert — mirrors the real @@unique([outsideWorkRequestId, userId]) constraint', async () => {
    await prisma.outsideWorkAssignee.createMany({
      data: [{ outsideWorkRequestId: 'req-9', userId: 'user-a' }],
    } as any)

    await expect(
      prisma.outsideWorkAssignee.createMany({
        data: [{ outsideWorkRequestId: 'req-9', userId: 'user-a' }],
      } as any),
    ).rejects.toThrow(/Unique constraint/)
  })

  it('POST never attempts a duplicate insert in the first place — app-level dedupe runs before createMany', async () => {
    vi.mocked(auth).mockResolvedValue(empSession as any)
    vi.mocked(prisma.outsideWorkRequest.create).mockResolvedValue({ id: 'req-2' } as any)
    vi.mocked(prisma.outsideWorkRequest.findUnique).mockResolvedValue({
      id: 'req-2', assignees: assigneesFor('req-2'),
    } as any)

    const res = await POST(makePost({ ...validCreatePayload, assigneeIds: ['user-a', 'user-a'] }))
    expect(res.status).toBe(200)

    const call = vi.mocked(prisma.outsideWorkAssignee.createMany).mock.calls[0][0] as any
    expect(call.data).toHaveLength(1) // deduped — the real constraint is never even exercised
  })

  it('if the DB layer ever did reject a duplicate pair (e.g. a race condition), POST surfaces it as a 500 rather than a silent/incorrect success', async () => {
    vi.mocked(auth).mockResolvedValue(empSession as any)
    vi.mocked(prisma.outsideWorkRequest.create).mockResolvedValue({ id: 'req-3' } as any)
    vi.mocked(prisma.outsideWorkAssignee.createMany).mockRejectedValueOnce(
      new Error('Unique constraint failed on the fields: (`outside_work_request_id`,`user_id`)'),
    )

    const res = await POST(makePost({ ...validCreatePayload, assigneeIds: ['user-a'] }))
    expect(res.status).toBe(500)
  })
})
