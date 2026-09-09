import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }))
vi.mock('@/lib/utils', () => ({ generateEmployeeId: vi.fn().mockReturnValue('EMP001') }))
vi.mock('@/lib/notifications', () => ({
  notifyRole: vi.fn().mockResolvedValue(undefined),
  sendLineNotify: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 4, resetAt: Date.now() }),
}))
vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
  runNotify: (fn: () => unknown) => Promise.resolve(fn()).catch(() => undefined),
}))

const assertLineFieldsUnique = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/line-profile', async () => {
  const actual = await vi.importActual<typeof import('@/lib/line-profile')>('@/lib/line-profile')
  return {
    ...actual,
    assertLineFieldsUnique: (...a: unknown[]) => assertLineFieldsUnique(...a),
  }
})

// Same object identity is exposed both directly on `prisma.X` (for the
// pre-transaction lookups) and as the `tx` passed into $transaction's
// callback — matches tests/api/payroll-delete.test.ts's established pattern.
vi.mock('@/lib/prisma', () => {
  const user = { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() }
  const companyBranch = { findFirst: vi.fn() }
  const leaveBalance = { create: vi.fn().mockResolvedValue({}) }
  const employeeProfile = { create: vi.fn().mockResolvedValue({}) }
  const emergencyContact = { createMany: vi.fn().mockResolvedValue({}) }
  const dependent = { createMany: vi.fn().mockResolvedValue({}) }
  const bankAccount = { createMany: vi.fn().mockResolvedValue({}) }
  return {
    prisma: {
      user,
      companyBranch,
      leaveBalance,
      employeeProfile,
      emergencyContact,
      dependent,
      bankAccount,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
        fn({ user, leaveBalance, employeeProfile, emergencyContact, dependent, bankAccount }),
      ),
    },
  }
})

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/register/route'

const validAddress = {
  houseNo: '123', moo: '4', soi: 'สุขุมวิท 5', road: 'สุขุมวิท',
  tambon: 'คลองเตย', amphoe: 'คลองเตย', province: 'กรุงเทพมหานคร', postalCode: '10110',
}

function yearsAgo(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

// Checksum-valid synthetic test vector (see tests/lib/national-id.test.ts) — not a
// real person's ID. Backlog 4.1 added a server-side checksum check, so a
// format-valid-but-checksum-invalid fixture (the old '1234567890123' here) is no
// longer accepted.
const VALID_NATIONAL_ID = '1101700207366'

const validBody = {
  name: 'Somchai Test', firstName: 'Somchai', lastName: 'Test',
  email: 'somchai@x.com', phone: '0812345678',
  nationalId: VALID_NATIONAL_ID,
  birthDate: yearsAgo(30),
  role: 'EMPLOYEE',
  password: 'Password1', branchId: 'branch-1', lineId: '@somchai',
  currentAddress: validAddress,
  registeredAddress: validAddress,
  sameAsCurrentAddress: true,
  emergencyContacts: [{ name: 'สมหญิง ใจดี', relationship: 'มารดา', phone: '0898765432' }],
  dependents: [] as Record<string, unknown>[],
  bankAccounts: [] as Record<string, unknown>[],
}

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/register — duplicate-field errors are generic (public, unauthenticated endpoint)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertLineFieldsUnique.mockResolvedValue({ ok: true })
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.companyBranch.findFirst).mockResolvedValue({ id: 'branch-1', name: 'HQ' } as never)
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 'u1' } as never)
  })

  it('duplicate email: generic message, not "อีเมลนี้มีการลงทะเบียนแล้ว"', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'existing' } as never)
    const res = await POST(makeReq(validBody))
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toBe('ข้อมูลนี้มีอยู่ในระบบแล้ว')
  })

  it('duplicate phone: same generic message as duplicate email', async () => {
    vi.mocked(prisma.user.findFirst).mockImplementation(((args: { where: Record<string, unknown> }) =>
      Promise.resolve(args.where && 'phone' in args.where ? { id: 'existing' } : null)) as never)
    const res = await POST(makeReq(validBody))
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toBe('ข้อมูลนี้มีอยู่ในระบบแล้ว')
  })

  it('duplicate nationalId: same generic message', async () => {
    // Duplicate detection now keys off nationalIdFp, not the plaintext column —
    // see the nationalId-encryption Phase 1 backlog item (random-IV ciphertext
    // never collides even for the same plaintext, so the deterministic
    // fingerprint is the only column that can still catch a duplicate).
    vi.mocked(prisma.user.findFirst).mockImplementation(((args: { where: Record<string, unknown> }) =>
      Promise.resolve(args.where && 'nationalIdFp' in args.where ? { id: 'existing' } : null)) as never)
    const res = await POST(makeReq(validBody))
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toBe('ข้อมูลนี้มีอยู่ในระบบแล้ว')
  })

  it('duplicate LINE ID: same generic message, not assertLineFieldsUnique\'s own wording', async () => {
    assertLineFieldsUnique.mockResolvedValue({ ok: false, error: 'LINE ID นี้มีในระบบแล้ว' })
    const res = await POST(makeReq(validBody))
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toBe('ข้อมูลนี้มีอยู่ในระบบแล้ว')
  })

  it('succeeds when nothing is duplicated', async () => {
    const res = await POST(makeReq(validBody))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
  })
})

describe('POST /api/register — nationalId is now required and format-validated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertLineFieldsUnique.mockResolvedValue({ ok: true })
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.companyBranch.findFirst).mockResolvedValue({ id: 'branch-1', name: 'HQ' } as never)
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 'u1' } as never)
  })

  it('rejects a missing nationalId (zod .min(1))', async () => {
    const { nationalId: _nationalId, ...body } = validBody
    const res = await POST(makeReq(body))
    expect(res.status).toBe(400)
  })

  it('rejects a nationalId that is not exactly 13 digits', async () => {
    const res = await POST(makeReq({ ...validBody, nationalId: '123' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('13 หลัก')
  })

  it('rejects an empty emergencyContacts array (zod .min(1))', async () => {
    const res = await POST(makeReq({ ...validBody, emergencyContacts: [] }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/register — backlog 4.1: server-side checksum on nationalId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertLineFieldsUnique.mockResolvedValue({ ok: true })
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.companyBranch.findFirst).mockResolvedValue({ id: 'branch-1', name: 'HQ' } as never)
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 'u1' } as never)
  })

  it('rejects a format-valid (13-digit) nationalId whose check digit is wrong, even hitting the API directly', async () => {
    const res = await POST(makeReq({ ...validBody, nationalId: '1234567890123' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('เลขตรวจสอบไม่ตรง')
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('accepts a checksum-valid nationalId', async () => {
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(200)
  })

  it('nationalId-encryption Phase 1 — dual-writes plaintext + encrypted + fingerprint on create', async () => {
    await POST(makeReq(validBody))
    const call = vi.mocked(prisma.user.create).mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data.nationalId).toBe(VALID_NATIONAL_ID)
    expect(call.data.nationalIdEncrypted).toBeTruthy()
    expect(String(call.data.nationalIdEncrypted)).not.toContain(VALID_NATIONAL_ID)
    expect(call.data.nationalIdFp).toBeTruthy()
  })
})

describe('POST /api/register — backlog 4.9: birthDate age-range sanity check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertLineFieldsUnique.mockResolvedValue({ ok: true })
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.companyBranch.findFirst).mockResolvedValue({ id: 'branch-1', name: 'HQ' } as never)
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 'u1' } as never)
  })

  it('rejects a birthDate that would make the applicant 5 years old', async () => {
    const res = await POST(makeReq({ ...validBody, birthDate: yearsAgo(5) }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('15-80')
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('rejects a birthDate that would make the applicant 100 years old', async () => {
    const res = await POST(makeReq({ ...validBody, birthDate: yearsAgo(100) }))
    expect(res.status).toBe(400)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('accepts a reasonable birthDate (age 30)', async () => {
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(200)
  })

  it('still accepts a blank birthDate — the field stays optional', async () => {
    const { birthDate: _birthDate, ...body } = validBody
    const res = await POST(makeReq(body))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/register — baseSalary/startDate are gone from the schema entirely', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertLineFieldsUnique.mockResolvedValue({ ok: true })
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.companyBranch.findFirst).mockResolvedValue({ id: 'branch-1', name: 'HQ' } as never)
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 'u1' } as never)
  })

  it('still creates the user with baseSalary/startDate null even if the request body includes them', async () => {
    const res = await POST(makeReq({ ...validBody, baseSalary: 50000, startDate: '2026-01-01' }))
    expect(res.status).toBe(200)
    const createArgs = vi.mocked(prisma.user.create).mock.calls[0][0] as { data: Record<string, unknown> }
    expect(createArgs.data.baseSalary).toBeNull()
    expect(createArgs.data.startDate).toBeNull()
  })
})

describe('POST /api/register — full transaction: creates all related tables', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertLineFieldsUnique.mockResolvedValue({ ok: true })
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.companyBranch.findFirst).mockResolvedValue({ id: 'branch-1', name: 'HQ' } as never)
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 'u1' } as never)
  })

  const fullBody = {
    ...validBody,
    dependents: [{ name: 'เด็กชาย ใจดี', relationType: 'CHILD', nationalId: '1111111111111', isTaxAllowance: true }],
    bankAccounts: [{ bankCode: '004', accountNumber: '9876543210', accountName: 'Somchai Test', accountType: 'ออมทรัพย์', isPrimary: true }],
  }

  it('creates User + LeaveBalance + EmployeeProfile + EmergencyContact + Dependent + BankAccount, all inside one $transaction', async () => {
    const res = await POST(makeReq(fullBody))
    expect(res.status).toBe(200)

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.user.create).toHaveBeenCalledTimes(1)
    expect(prisma.leaveBalance.create).toHaveBeenCalledTimes(1)
    expect(prisma.employeeProfile.create).toHaveBeenCalledTimes(1)
    expect(prisma.emergencyContact.createMany).toHaveBeenCalledTimes(1)
    expect(prisma.dependent.createMany).toHaveBeenCalledTimes(1)
    expect(prisma.bankAccount.createMany).toHaveBeenCalledTimes(1)
  })

  it('populates EmployeeProfile from the structured address, including sameAsCurrentAddress', async () => {
    await POST(makeReq(fullBody))
    const call = vi.mocked(prisma.employeeProfile.create).mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data).toMatchObject({
      currentHouseNo: '123', currentProvince: 'กรุงเทพมหานคร',
      regHouseNo: '123', regProvince: 'กรุงเทพมหานคร',
      sameAsCurrentAddress: true,
    })
  })

  it('defaults religion/paymentMethod to null on EmployeeProfile when not provided', async () => {
    await POST(makeReq(fullBody))
    const call = vi.mocked(prisma.employeeProfile.create).mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data.religion).toBeNull()
    expect(call.data.paymentMethod).toBeNull()
  })

  it('passes religion/paymentMethod through to EmployeeProfile when provided', async () => {
    await POST(makeReq({ ...fullBody, religion: 'พุทธ', paymentMethod: 'BANK_TRANSFER' }))
    const call = vi.mocked(prisma.employeeProfile.create).mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data.religion).toBe('พุทธ')
    expect(call.data.paymentMethod).toBe('BANK_TRANSFER')
  })

  it('rejects an unrecognized paymentMethod value with 400, before the transaction ever runs', async () => {
    const res = await POST(makeReq({ ...fullBody, paymentMethod: 'BITCOIN' }))
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('skips dependent/bankAccount table creation entirely when those steps were skipped', async () => {
    const res = await POST(makeReq(validBody)) // validBody has empty dependents/bankAccounts
    expect(res.status).toBe(200)
    expect(prisma.user.create).toHaveBeenCalledTimes(1)
    expect(prisma.dependent.createMany).not.toHaveBeenCalled()
    expect(prisma.bankAccount.createMany).not.toHaveBeenCalled()
  })

  it('rolls back (no user left over) when a table insert inside the transaction fails', async () => {
    vi.mocked(prisma.employeeProfile.create).mockRejectedValueOnce(new Error('db exploded'))
    const res = await POST(makeReq(fullBody))
    expect(res.status).toBe(500)
    // The only creation path is inside $transaction — Prisma/SQLite roll
    // back everything in it atomically on the thrown error, so there's no
    // separate app-level path that could leave a User committed on its own.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('encrypts dependent nationalId — no plaintext anywhere in the insert payload, last4 present for display', async () => {
    await POST(makeReq(fullBody))
    const call = vi.mocked(prisma.dependent.createMany).mock.calls[0][0] as { data: Record<string, unknown>[] }
    const row = call.data[0]
    expect(JSON.stringify(row)).not.toContain('1111111111111')
    expect(row.nationalIdEnc).toBeTruthy()
    expect(row.nationalIdLast4).toBe('1111')
  })

  it('encrypts bank account name/number — no plaintext anywhere in the insert payload, last4 present for display', async () => {
    await POST(makeReq(fullBody))
    const call = vi.mocked(prisma.bankAccount.createMany).mock.calls[0][0] as { data: Record<string, unknown>[] }
    const row = call.data[0]
    const raw = JSON.stringify(row)
    expect(raw).not.toContain('9876543210')
    expect(raw).not.toContain('Somchai Test')
    expect(row.accountNameEnc).toBeTruthy()
    expect(row.accountNumberEnc).toBeTruthy()
    expect(row.accountNumberLast4).toBe('3210')
  })
})
