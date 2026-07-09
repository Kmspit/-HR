import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    caseDocument: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    caseDocumentVersion: { findFirst: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('cloudinary', () => ({
  v2: { config: vi.fn(), uploader: { destroy: vi.fn() } },
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/case-documents/[id]/route'

const params = Promise.resolve({ id: 'doc-1' })

function makeGetReq() {
  return new NextRequest('http://localhost/api/case-documents/doc-1')
}

describe('GET /api/case-documents/[id] — requires the same access as PATCH/DELETE in this file', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await GET(makeGetReq(), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the document does not exist', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'EMPLOYEE' } } as never)
    vi.mocked(prisma.caseDocument.findUnique).mockResolvedValue(null as never)
    const res = await GET(makeGetReq(), { params })
    expect(res.status).toBe(404)
  })

  it('forbids a caller who is neither a manage-role nor the uploader from reading the document', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'stranger-1', role: 'EMPLOYEE' } } as never)
    vi.mocked(prisma.caseDocument.findUnique).mockResolvedValue({ id: 'doc-1', uploadedById: 'owner-1' } as never)
    const res = await GET(makeGetReq(), { params })
    expect(res.status).toBe(403)
  })

  it('allows the document uploader to read their own document', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'owner-1', role: 'EMPLOYEE' } } as never)
    vi.mocked(prisma.caseDocument.findUnique).mockResolvedValue({ id: 'doc-1', uploadedById: 'owner-1' } as never)
    const res = await GET(makeGetReq(), { params })
    expect(res.status).toBe(200)
  })

  for (const role of ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER', 'ADMIN']) {
    it(`allows manage-role ${role} to read any document`, async () => {
      vi.mocked(auth).mockResolvedValue({ user: { id: 'mgr-1', role } } as never)
      vi.mocked(prisma.caseDocument.findUnique).mockResolvedValue({ id: 'doc-1', uploadedById: 'someone-else' } as never)
      const res = await GET(makeGetReq(), { params })
      expect(res.status).toBe(200)
    })
  }

  it('forbids LAWYER (not in the manage-role list) from reading a document uploaded by someone else', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'lawyer-1', role: 'LAWYER' } } as never)
    vi.mocked(prisma.caseDocument.findUnique).mockResolvedValue({ id: 'doc-1', uploadedById: 'someone-else' } as never)
    const res = await GET(makeGetReq(), { params })
    expect(res.status).toBe(403)
  })
})
