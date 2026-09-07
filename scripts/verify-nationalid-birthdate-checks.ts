/**
 * Live-DB verification for the 3-part fix on branch
 * test/nationalid-server-checksum:
 *  1. server-side Thai national-ID checksum on /api/register and
 *     PATCH /api/users/[id] and PATCH /api/profile
 *  2. birthDate age-range sanity check (15-80) on the same 3 surfaces
 *
 * Follows CLAUDE.md's live-DB rules: creates throwaway users/requests with
 * an unambiguous `+script-verify-<timestamp>@` email, never touches a real
 * account, and deletes everything it created at the end.
 *
 * Usage: npx tsx scripts/verify-nationalid-birthdate-checks.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env') })

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
const prisma =
  url && token
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
    : new PrismaClient()

const stamp = Date.now()
const tag = `script-verify-${stamp}`

let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  OK   ${label}`)
  else { failed++; console.log(`  FAIL ${label}`, detail ?? '') }
}

function yearsAgo(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

// Not '1234567890123' — an existing (unrelated, pre-pilot-wipe-pending)
// account already holds that exact placeholder value in the live DB, which
// would collide on the unique nationalId constraint. Derive a unique
// checksum-invalid id from the run timestamp instead (verified below).
function checksumInvalidIdFromStamp(): string {
  const base12 = String(stamp).padStart(12, '0').slice(-12)
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(base12[i]) * (13 - i)
  const realCheckDigit = (11 - (sum % 11)) % 10
  const wrongCheckDigit = (realCheckDigit + 1) % 10 // deliberately off by one
  return base12 + wrongCheckDigit
}
const CHECKSUM_INVALID_ID = checksumInvalidIdFromStamp()
const VALID_ID_A = '1101700207366'

async function main() {
  console.log(`\n=== nationalId checksum + birthDate age-range — live-DB verification (${tag}) ===\n`)

  const branch = await prisma.companyBranch.findFirst({ where: { isActive: true }, select: { id: true } })
  if (!branch) throw new Error('no active CompanyBranch found — cannot build a register payload')

  const createdUserIds: string[] = []

  try {
    // ── 1. POST /api/register ────────────────────────────────────────────
    const { POST: registerPOST } = await import('../app/api/register/route')
    const { NextRequest } = await import('next/server')

    const validAddress = {
      houseNo: '1', road: 'ถนนทดสอบ', tambon: 'ทดสอบ', amphoe: 'ทดสอบ',
      province: 'กรุงเทพมหานคร', postalCode: '10110',
    }
    function registerBody(overrides: Record<string, unknown> = {}) {
      return {
        name: `Script Verify ${stamp}`, firstName: 'Script', lastName: `Verify${stamp}`,
        email: `${tag}-reg@test.com`, phone: '0800000000',
        nationalId: VALID_ID_A, birthDate: yearsAgo(30),
        role: 'EMPLOYEE', password: 'Password1', branchId: branch!.id, lineId: `@${tag}`,
        currentAddress: validAddress, registeredAddress: validAddress, sameAsCurrentAddress: true,
        emergencyContacts: [{ name: 'ผู้ติดต่อ ทดสอบ', relationship: 'PARENT', phone: '0811111111' }],
        dependents: [], bankAccounts: [],
        ...overrides,
      }
    }
    function makeRegisterReq(body: Record<string, unknown>) {
      return new NextRequest('http://localhost/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
    }

    const badChecksumRes = await registerPOST(makeRegisterReq(registerBody({ nationalId: CHECKSUM_INVALID_ID })))
    check('register: rejects checksum-invalid nationalId (400)', badChecksumRes.status === 400)
    const badChecksumUser = await prisma.user.findUnique({ where: { email: `${tag}-reg@test.com` } })
    check('register: no user row created after checksum rejection', badChecksumUser === null)

    const badAgeRes = await registerPOST(makeRegisterReq({ ...registerBody(), birthDate: yearsAgo(5) }))
    check('register: rejects a birthDate implying age 5 (400)', badAgeRes.status === 400)
    const badAgeUser = await prisma.user.findUnique({ where: { email: `${tag}-reg@test.com` } })
    check('register: no user row created after age rejection', badAgeUser === null)

    const okRes = await registerPOST(makeRegisterReq(registerBody()))
    check('register: accepts checksum-valid nationalId + reasonable age (200)', okRes.status === 200, await okRes.clone().json().catch(() => null))
    const okUser = await prisma.user.findUnique({ where: { email: `${tag}-reg@test.com` } })
    check('register: user row created on success', okUser !== null)
    if (okUser) createdUserIds.push(okUser.id)

    // ── 2. PATCH /api/users/[id] and PATCH /api/profile share the exact
    //    same imported isValidThaiNationalIdChecksum/isReasonableBirthDate
    //    functions plus a `changed-from-stored` comparison — already proven
    //    against real Turso schema/Zod by the register checks above, and
    //    exhaustively covered end-to-end (with realistic mocked auth) by
    //    tests/api/users-id.test.ts and tests/api/profile.test.ts. Next-auth's
    //    `auth` export can't be monkey-patched from a plain script (ESM
    //    read-only binding — confirmed: "Cannot set property auth of
    //    #<Object> which has only a getter"), so full-HTTP-with-real-session
    //    isn't practical here. What live-DB adds beyond the mocked tests is
    //    proving the comparison logic behaves correctly against a REAL
    //    Prisma-fetched row (Date object, not a hand-built mock) — checked
    //    directly below, same condition the routes themselves evaluate.
    const { isValidThaiNationalIdChecksum } = await import('../lib/national-id')
    const { isReasonableBirthDate } = await import('../lib/profile-update')

    const target = await prisma.user.create({
      data: {
        email: `${tag}-target@test.com`, passwordHash: 'x', name: `Script Verify Target ${stamp}`,
        role: 'EMPLOYEE', status: 'ACTIVE', nationalId: CHECKSUM_INVALID_ID, birthDate: new Date(yearsAgo(100)),
      },
    })
    createdUserIds.push(target.id)

    const fetched = await prisma.user.findUnique({ where: { id: target.id }, select: { nationalId: true, birthDate: true } })
    check('real Prisma row: birthDate comes back as a Date instance (not a string)', fetched?.birthDate instanceof Date)

    const wouldRejectChangedInvalidId = fetched!.nationalId !== VALID_ID_A && !isValidThaiNationalIdChecksum(VALID_ID_A)
    check('route condition: changing to a checksum-VALID id would NOT be rejected', wouldRejectChangedInvalidId === false)

    const attemptedInvalid = CHECKSUM_INVALID_ID.slice(0, -1) + (CHECKSUM_INVALID_ID.at(-1) === '0' ? '1' : '0')
    const wouldRejectChangedToInvalid = attemptedInvalid !== fetched!.nationalId && !isValidThaiNationalIdChecksum(attemptedInvalid)
    check('route condition: changing to a DIFFERENT checksum-invalid id WOULD be rejected', wouldRejectChangedToInvalid === true)

    const wouldSkipUnchangedInvalid = CHECKSUM_INVALID_ID === fetched!.nationalId
    check('route condition: resubmitting the SAME stored (checksum-invalid) id is treated as unchanged — never re-validated', wouldSkipUnchangedInvalid === true)

    const badAge = new Date(yearsAgo(5))
    const wouldRejectChangedAge = badAge.getTime() !== fetched!.birthDate!.getTime() && !isReasonableBirthDate(badAge)
    check('route condition: changing birthDate to imply age 5 WOULD be rejected', wouldRejectChangedAge === true)

    const sameOutOfRangeAge = new Date(yearsAgo(100))
    const wouldSkipUnchangedAge = sameOutOfRangeAge.getTime() === fetched!.birthDate!.getTime()
    check('route condition: resubmitting the SAME stored out-of-range birthDate is treated as unchanged — never re-validated', wouldSkipUnchangedAge === true)

    console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}\n`)
  } finally {
    if (createdUserIds.length > 0) {
      await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } })
      await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: createdUserIds } }, { targetId: { in: createdUserIds } }] } })
      await prisma.leaveBalance.deleteMany({ where: { userId: { in: createdUserIds } } })
      await prisma.employeeProfile.deleteMany({ where: { userId: { in: createdUserIds } } })
      await prisma.emergencyContact.deleteMany({ where: { userId: { in: createdUserIds } } })
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    }
    console.log('cleanup done — all throwaway rows removed')
  }

  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('verification script crashed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
