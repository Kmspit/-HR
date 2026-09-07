/**
 * Live-DB verification for the profile self-service feature (branch
 * test/profile-self-service). Follows CLAUDE.md's live-DB rules: creates
 * throwaway users with an unambiguous `+script-verify-<timestamp>@` email,
 * never touches or borrows a real account, and deletes everything it created
 * at the end (even on failure).
 *
 * Per explicit instruction, this script does NOT call notifyRole() — that
 * would fire a real notification at every real ACTIVE MANAGER_HR user in
 * production. The notifyRole call sites (app/api/profile PATCH,
 * bank-accounts POST/PATCH) are covered instead by mocked unit tests
 * (tests/api/profile.test.ts, tests/api/bank-accounts.test.ts).
 *
 * Usage: npx tsx scripts/verify-profile-self-service.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env') })

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { encryptField, decryptField, FIELD_SALTS } from '../lib/field-crypto'
import { canAccessUserProfile, canEditUserProfile } from '../lib/user-access'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
const prisma =
  url && token
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
    : new PrismaClient()

const stamp = Date.now()
const tag = `script-verify-${stamp}`
const emailA = `${tag}-a@test.com`
const emailB = `${tag}-b@test.com`
const emailHr = `${tag}-hr@test.com`

let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  OK   ${label}`)
  } else {
    failed++
    console.log(`  FAIL ${label}`, detail ?? '')
  }
}

async function main() {
  console.log(`\n=== profile self-service live-DB verification (${tag}) ===\n`)

  const jobPosition = await prisma.jobPosition.findFirst()
  if (!jobPosition) throw new Error('no JobPosition rows exist — cannot build a valid EmploymentAssignment')

  const userA = await prisma.user.create({
    data: {
      email: emailA,
      passwordHash: 'x',
      name: `Script Verify A ${stamp}`,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    },
  })
  const userB = await prisma.user.create({
    data: {
      email: emailB,
      passwordHash: 'x',
      name: `Script Verify B ${stamp}`,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    },
  })
  const userHr = await prisma.user.create({
    data: {
      email: emailHr,
      passwordHash: 'x',
      name: `Script Verify HR ${stamp}`,
      role: 'MANAGER_HR',
      status: 'ACTIVE',
    },
  })
  console.log(`created throwaway users: A=${userA.id} B=${userB.id} HR=${userHr.id}`)

  try {
    // ── 1. Employee A's own Phase 1 records ──────────────────────────
    const profile = await prisma.employeeProfile.create({
      data: {
        userId: userA.id,
        nationality: 'ไทย',
        currentProvince: 'กรุงเทพมหานคร',
        regProvince: 'กรุงเทพมหานคร',
      },
    })
    const contact = await prisma.emergencyContact.create({
      data: { userId: userA.id, name: 'ผู้ติดต่อฉุกเฉิน ทดสอบ', relationship: 'PARENT', phone: '0899999999' },
    })
    const dependentNationalId = '1234567890123'
    const dependent = await prisma.dependent.create({
      data: {
        userId: userA.id,
        name: 'บุตร ทดสอบ',
        relationType: 'CHILD',
        nationalIdEnc: encryptField(dependentNationalId, FIELD_SALTS.DEPENDENT_NATIONAL_ID),
        nationalIdLast4: dependentNationalId.slice(-4),
        isTaxAllowance: true,
      },
    })
    const bankAccountNumber = '1112223334'
    const bankAccount = await prisma.bankAccount.create({
      data: {
        userId: userA.id,
        bankCode: 'SCB',
        accountNameEnc: encryptField('Script Verify A', FIELD_SALTS.BANK_ACCOUNT),
        accountNumberEnc: encryptField(bankAccountNumber, FIELD_SALTS.BANK_ACCOUNT),
        accountNumberLast4: bankAccountNumber.slice(-4),
        isPrimary: true,
      },
    })
    const assignment = await prisma.employmentAssignment.create({
      data: {
        userId: userA.id,
        effectiveFrom: new Date(),
        changeType: 'HIRE',
        employmentType: 'FULL_TIME',
        jobPositionId: jobPosition.id,
        baseSalary: 30000,
        createdById: userHr.id,
      },
    })

    // ── 2. Self-view round-trip: what the self-service tabs would read ──
    const readProfile = await prisma.employeeProfile.findUnique({ where: { userId: userA.id } })
    check('EmployeeProfile round-trips for self-view', readProfile?.id === profile.id)

    const readContacts = await prisma.emergencyContact.findMany({ where: { userId: userA.id } })
    check('EmergencyContact round-trips for self-view', readContacts.some((c) => c.id === contact.id))

    const readDependents = await prisma.dependent.findMany({ where: { userId: userA.id } })
    const readDependent = readDependents.find((d) => d.id === dependent.id)
    check(
      'Dependent nationalId decrypts back to the original value (self-reveal)',
      !!readDependent && decryptField(readDependent.nationalIdEnc!, FIELD_SALTS.DEPENDENT_NATIONAL_ID) === dependentNationalId,
    )

    const readBankAccounts = await prisma.bankAccount.findMany({ where: { userId: userA.id } })
    const readBankAccount = readBankAccounts.find((b) => b.id === bankAccount.id)
    check(
      'BankAccount number decrypts back to the original value (self-reveal)',
      !!readBankAccount && decryptField(readBankAccount.accountNumberEnc, FIELD_SALTS.BANK_ACCOUNT) === bankAccountNumber,
    )

    const readAssignments = await prisma.employmentAssignment.findMany({ where: { userId: userA.id } })
    const readAssignment = readAssignments.find((a) => a.id === assignment.id)
    check('EmploymentAssignment baseSalary visible for self-view', readAssignment?.baseSalary === 30000)

    // ── 3. Self access-control: A viewing/editing A's own record ────────
    const selfView = await canAccessUserProfile(prisma, userA.id, 'EMPLOYEE', null, userA.id)
    check('canAccessUserProfile: employee A can view their own record', selfView === true)
    const selfEdit = await canEditUserProfile(prisma, userA.id, 'EMPLOYEE', null, userA.id)
    check('canEditUserProfile: employee A can edit their own record', selfEdit === true)

    // ── 4. Cross-employee 403: B has no route to A's record ──────────────
    const crossView = await canAccessUserProfile(prisma, userB.id, 'EMPLOYEE', null, userA.id)
    check('canAccessUserProfile: plain employee B is denied viewing A (would 403)', crossView === false)
    const crossEdit = await canEditUserProfile(prisma, userB.id, 'EMPLOYEE', null, userA.id)
    check('canEditUserProfile: plain employee B is denied editing A (would 403)', crossEdit === false)

    // ── 5. HR viewing/editing someone else IS allowed (contrast case) ────
    const hrView = await canAccessUserProfile(prisma, userHr.id, 'MANAGER_HR', null, userA.id)
    check('canAccessUserProfile: MANAGER_HR can view A (contrast to #4)', hrView === true)

    // ── 6. AuditLog write path used by the sensitive-reveal routes when a
    //      non-self viewer (e.g. HR) reveals someone else's data ───────────
    const auditRow = await prisma.auditLog.create({
      data: {
        actorId: userHr.id,
        targetId: userA.id,
        targetType: 'User',
        action: 'VIEW',
        after: JSON.stringify({ note: 'script-verify sensitive reveal by HR' }),
      },
    })
    const readAudit = await prisma.auditLog.findUnique({ where: { id: auditRow.id } })
    check('AuditLog row created for a non-self ("HR viewed someone else") reveal', readAudit?.actorId === userHr.id && readAudit?.targetId === userA.id)

    // ── 7. NotificationType enum accepts PROFILE_SENSITIVE_SELF_EDIT — a
    //      structural check only; targets our own throwaway HR user so no
    //      real HR account is touched (see file header for why notifyRole
    //      itself is not invoked here). ───────────────────────────────────
    const notif = await prisma.notification.create({
      data: {
        userId: userHr.id,
        type: 'PROFILE_SENSITIVE_SELF_EDIT',
        title: 'script-verify',
        message: 'script-verify — safe to ignore, throwaway row',
      },
    })
    check('NotificationType.PROFILE_SENSITIVE_SELF_EDIT is a valid, insertable enum value', !!notif.id)

    console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}\n`)
  } finally {
    // ── cleanup — FK-safe order, always runs even if a check threw ───────
    await prisma.notification.deleteMany({ where: { userId: { in: [userA.id, userB.id, userHr.id] } } })
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: [userA.id, userB.id, userHr.id] } }, { targetId: { in: [userA.id, userB.id, userHr.id] } }] } })
    await prisma.employmentAssignment.deleteMany({ where: { userId: userA.id } })
    await prisma.bankAccount.deleteMany({ where: { userId: userA.id } })
    await prisma.dependent.deleteMany({ where: { userId: userA.id } })
    await prisma.emergencyContact.deleteMany({ where: { userId: userA.id } })
    await prisma.employeeProfile.deleteMany({ where: { userId: userA.id } })
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id, userHr.id] } } })
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
