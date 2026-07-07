import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    warning: {
      count:      vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      findUnique: vi.fn(),
    },
    notification: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/warnings/route'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePost(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/warnings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function sessionFor(role: string) {
  return { user: { id: 'issuer-1', role, name: 'Issuer', branchId: null } }
}

const validPayload = { userId: 'emp-1', reason: 'มาสายซ้ำ', sendToEmployee: false }

// Matches canManageWarnings = canApproveWarning(role) || canManageUsers(role) in
// app/(dashboard)/warnings/page.tsx — the UI shows the "ออกใบเตือน" button to
// exactly these 7 roles, so the API must accept all of them too.
const ALLOWED_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'ENFORCEMENT']
const DENIED_ROLES  = ['EMPLOYEE', 'LAWYER', 'TEAM_LEADER', 'CLIENT']

describe('POST /api/warnings — role gate matches the 7 roles the UI shows the button to', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.warning.count).mockResolvedValue(0 as never)
    vi.mocked(prisma.warning.create).mockResolvedValue({ id: 'warn-1' } as never)
    vi.mocked(prisma.warning.update).mockResolvedValue({ id: 'warn-1' } as never)
    vi.mocked(prisma.warning.findUnique).mockResolvedValue({ fileUrl: null } as never)
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await POST(makePost(validPayload))
    expect(res.status).toBe(401)
  })

  for (const role of ALLOWED_ROLES) {
    it(`allows ${role} to create a warning`, async () => {
      vi.mocked(auth).mockResolvedValue(sessionFor(role) as never)
      const res = await POST(makePost(validPayload))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.warning.id).toBe('warn-1')
      expect(prisma.warning.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'emp-1', reason: 'มาสายซ้ำ', issuedById: 'issuer-1' }),
        }),
      )
    })
  }

  for (const role of DENIED_ROLES) {
    it(`forbids ${role} from creating a warning`, async () => {
      vi.mocked(auth).mockResolvedValue(sessionFor(role) as never)
      const res = await POST(makePost(validPayload))
      expect(res.status).toBe(403)
      expect(prisma.warning.create).not.toHaveBeenCalled()
    })
  }
})
