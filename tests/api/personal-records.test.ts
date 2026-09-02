import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireOrgScope: vi.fn(),
  isGuardResponse: (v: unknown) => v instanceof Response,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    emergencyContact: { findMany: vi.fn() },
    dependent: { findMany: vi.fn() },
    bankAccount: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/field-crypto', () => ({
  decryptField: (blob: string) => `decrypted:${blob}`,
  FIELD_SALTS: { BANK_ACCOUNT: 'salt' },
}))

import { requireAuth, requireOrgScope } from '@/lib/api-guard'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/users/[id]/personal-records/route'

function makeReq(id: string) {
  return new NextRequest(`http://localhost/api/users/${id}/personal-records`)
}
const params = (id: string) => Promise.resolve({ id })
const hrSession = { user: { id: 'hr-1', role: 'HR', branchId: 'b1' } }

describe('GET /api/users/[id]/personal-records', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(hrSession as never)
    vi.mocked(requireOrgScope).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.emergencyContact.findMany).mockResolvedValue([])
    vi.mocked(prisma.dependent.findMany).mockResolvedValue([])
    vi.mocked(prisma.bankAccount.findMany).mockResolvedValue([])
  })

  it('passes through a guard-denied response', async () => {
    vi.mocked(requireAuth).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as never)
    const res = await GET(makeReq('emp-9'), { params: params('emp-9') })
    expect(res.status).toBe(401)
  })

  it('403s a viewer without view scope', async () => {
    vi.mocked(requireOrgScope).mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as never)
    const res = await GET(makeReq('emp-9'), { params: params('emp-9') })
    expect(res.status).toBe(403)
  })

  it('returns emergencyContacts as-is (no encryption on that model)', async () => {
    vi.mocked(prisma.emergencyContact.findMany).mockResolvedValue([
      { id: 'c1', name: 'A', relationship: 'พี่', phone: '0812345678', altPhone: null, address: null, isPrimary: true },
    ] as never)
    const res = await GET(makeReq('emp-9'), { params: params('emp-9') })
    const data = await res.json()
    expect(data.emergencyContacts).toHaveLength(1)
    expect(data.emergencyContacts[0].isPrimary).toBe(true)
  })

  it('never includes nationalIdEnc for dependents — only the last4', async () => {
    vi.mocked(prisma.dependent.findMany).mockResolvedValue([
      { id: 'd1', name: 'เด็ก', relationType: 'CHILD', birthDate: new Date('2020-01-01'), nationalIdLast4: '1234', isTaxAllowance: true, note: null },
    ] as never)
    const res = await GET(makeReq('emp-9'), { params: params('emp-9') })
    const raw = await res.text()
    expect(raw).not.toContain('nationalIdEnc')
    expect(raw).toContain('1234')
    const data = JSON.parse(raw)
    expect(data.dependents[0].birthDate).toBe('2020-01-01')
  })

  it('decrypts accountName but never includes the raw accountNumberEnc for bank accounts', async () => {
    vi.mocked(prisma.bankAccount.findMany).mockResolvedValue([
      { id: 'b1', bankCode: 'SCB', accountNameEnc: 'enc-name-blob', accountNumberLast4: '5678', accountType: null, isPrimary: true, isActive: true },
    ] as never)
    const res = await GET(makeReq('emp-9'), { params: params('emp-9') })
    const raw = await res.text()
    expect(raw).not.toContain('accountNumberEnc')
    expect(raw).not.toContain('accountNameEnc')
    const data = JSON.parse(raw)
    expect(data.bankAccounts[0].accountName).toBe('decrypted:enc-name-blob')
    expect(data.bankAccounts[0].accountNumberLast4).toBe('5678')
  })
})
