import { prisma } from '@/lib/prisma'
import { DEFAULT_COMPANY_BRANCHES, HQ_BRANCH_ID, NMA_BRANCH_ID } from '@/lib/company-branches'
import { seedDefaultOrgStructure } from '@/lib/default-org-structure'

let ensurePromise: Promise<boolean> | null = null

/** Idempotent Turso/SQLite patches — safe to call on every cold start */
export async function ensureDbSchema(): Promise<boolean> {
  if (!process.env.TURSO_DATABASE_URL) return true
  if (!ensurePromise) {
    ensurePromise = runEnsure().catch((err) => {
      ensurePromise = null
      console.error('[ensureDbSchema]', err)
      return false
    })
  }
  return ensurePromise
}

async function userColumns(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>('PRAGMA table_info(users)')
  return rows.map((r) => r.name)
}

async function addUserColumnIfMissing(column: string, ddl: string) {
  const cols = await userColumns()
  if (cols.includes(column)) return
  try {
    await prisma.$executeRawUnsafe(ddl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('duplicate column')) throw err
  }
}

async function runEnsure(): Promise<boolean> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS company_branches (
      id TEXT NOT NULL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      nameEn TEXT,
      address TEXT,
      phone TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      isDefault INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await addUserColumnIfMissing('branchId', `ALTER TABLE users ADD COLUMN branchId TEXT`)
  await addUserColumnIfMissing(
    'profileImageBase64',
    `ALTER TABLE users ADD COLUMN profileImageBase64 TEXT`,
  )

  for (const b of DEFAULT_COMPANY_BRANCHES) {
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO company_branches (id, code, name, nameEn, address, isActive, isDefault, createdAt, updatedAt)
      VALUES (${b.id}, ${b.code}, ${b.name}, ${b.nameEn}, ${b.address}, 1, ${b.isDefault ? 1 : 0}, datetime('now'), datetime('now'))
    `
    await prisma.$executeRaw`
      UPDATE company_branches
      SET code = ${b.code}, name = ${b.name}, nameEn = ${b.nameEn}, address = ${b.address},
          isActive = 1, isDefault = ${b.isDefault ? 1 : 0}, updatedAt = datetime('now')
      WHERE id = ${b.id}
    `
  }

  const hqId = DEFAULT_COMPANY_BRANCHES[0].id
  await prisma.$executeRaw`
    UPDATE users SET branchId = ${hqId} WHERE branchId IS NULL OR branchId = ''
  `

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS divisions (
      id TEXT NOT NULL PRIMARY KEY,
      branchId TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      nameEn TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(branchId, code)
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT NOT NULL PRIMARY KEY,
      branchId TEXT NOT NULL,
      divisionId TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      nameEn TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(divisionId, code)
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT NOT NULL PRIMARY KEY,
      branchId TEXT NOT NULL,
      departmentId TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      nameEn TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(departmentId, code)
    )
  `)

  await addUserColumnIfMissing('divisionId', `ALTER TABLE users ADD COLUMN divisionId TEXT`)
  await addUserColumnIfMissing('departmentId', `ALTER TABLE users ADD COLUMN departmentId TEXT`)
  await addUserColumnIfMissing('sectionId', `ALTER TABLE users ADD COLUMN sectionId TEXT`)
  await addUserColumnIfMissing('lineUserId', `ALTER TABLE users ADD COLUMN lineUserId TEXT`)
  await addUserColumnIfMissing('lineDisplayName', `ALTER TABLE users ADD COLUMN lineDisplayName TEXT`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS company_holidays (
      id TEXT NOT NULL PRIMARY KEY,
      holidayName TEXT NOT NULL,
      holidayDate DATETIME NOT NULL,
      holidayType TEXT NOT NULL,
      repeatEveryYear INTEGER NOT NULL DEFAULT 0,
      branchId TEXT,
      createdById TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  for (const branchId of [HQ_BRANCH_ID, NMA_BRANCH_ID]) {
    try {
      await seedDefaultOrgStructure(prisma, branchId)
    } catch (err) {
      console.warn('[ensureDbSchema] org seed', branchId, err)
    }
  }

  await addPayrollColumnIfMissing(
    'lateBillableMinutes',
    `ALTER TABLE payrolls ADD COLUMN lateBillableMinutes INTEGER NOT NULL DEFAULT 0`,
  )
  await addPayrollColumnIfMissing(
    'lateDeductionDetail',
    `ALTER TABLE payrolls ADD COLUMN lateDeductionDetail TEXT`,
  )

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_face_profiles (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL UNIQUE,
      encryptedDescriptor TEXT NOT NULL,
      modelVersion TEXT NOT NULL DEFAULT 'face-api-tiny-v1',
      sampleCount INTEGER NOT NULL DEFAULT 1,
      registeredAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS attendance_face_logs (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL,
      attendanceId TEXT,
      action TEXT NOT NULL,
      method TEXT NOT NULL,
      matched INTEGER NOT NULL DEFAULT 0,
      matchScore REAL,
      livenessScore REAL,
      spoofFlags TEXT,
      failureReason TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS attendance_face_logs_user_created_idx
    ON attendance_face_logs (userId, createdAt)
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS line_link_codes (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      expiresAt DATETIME NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS line_link_codes_user_idx ON line_link_codes (userId)
  `)

  await addWarningColumnIfMissing(
    'lineDeliveryStatus',
    `ALTER TABLE warnings ADD COLUMN lineDeliveryStatus TEXT`,
  )
  await addWarningColumnIfMissing('lineSentAt', `ALTER TABLE warnings ADD COLUMN lineSentAt DATETIME`)
  await addWarningColumnIfMissing('lineUserId', `ALTER TABLE warnings ADD COLUMN lineUserId TEXT`)
  await addWarningColumnIfMissing(
    'lineErrorMessage',
    `ALTER TABLE warnings ADD COLUMN lineErrorMessage TEXT`,
  )

  await addAttendanceColumnIfMissing('dayOfWeek', `ALTER TABLE attendances ADD COLUMN dayOfWeek INTEGER`)
  await addAttendanceColumnIfMissing(
    'workMinutes',
    `ALTER TABLE attendances ADD COLUMN workMinutes INTEGER NOT NULL DEFAULT 0`,
  )
  await addAttendanceColumnIfMissing('leaveType', `ALTER TABLE attendances ADD COLUMN leaveType TEXT`)
  await addAttendanceColumnIfMissing('checkInLat', `ALTER TABLE attendances ADD COLUMN checkInLat REAL`)
  await addAttendanceColumnIfMissing('checkInLng', `ALTER TABLE attendances ADD COLUMN checkInLng REAL`)
  await addAttendanceColumnIfMissing(
    'checkInAddress',
    `ALTER TABLE attendances ADD COLUMN checkInAddress TEXT`,
  )
  await addAttendanceColumnIfMissing(
    'checkInWorkPlaceName',
    `ALTER TABLE attendances ADD COLUMN checkInWorkPlaceName TEXT`,
  )
  await addAttendanceColumnIfMissing('checkOutLat', `ALTER TABLE attendances ADD COLUMN checkOutLat REAL`)
  await addAttendanceColumnIfMissing('checkOutLng', `ALTER TABLE attendances ADD COLUMN checkOutLng REAL`)
  await addAttendanceColumnIfMissing(
    'checkOutAddress',
    `ALTER TABLE attendances ADD COLUMN checkOutAddress TEXT`,
  )
  await addAttendanceColumnIfMissing(
    'checkOutWorkPlaceName',
    `ALTER TABLE attendances ADD COLUMN checkOutWorkPlaceName TEXT`,
  )

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS attendance_line_notify_logs (
      id TEXT NOT NULL PRIMARY KEY,
      employeeUserId TEXT NOT NULL,
      hrLineUserId TEXT NOT NULL,
      eventType TEXT NOT NULL,
      attendanceId TEXT,
      faceLogId TEXT,
      messageText TEXT NOT NULL,
      photoUrl TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      failedReason TEXT,
      retryCount INTEGER NOT NULL DEFAULT 0,
      sentAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS attendance_line_notify_status_idx
    ON attendance_line_notify_logs (status, createdAt)
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS attendance_line_notify_employee_idx
    ON attendance_line_notify_logs (employeeUserId, createdAt)
  `)

  return true
}

async function attendanceColumns(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>('PRAGMA table_info(attendances)')
  return rows.map((r) => r.name)
}

async function addAttendanceColumnIfMissing(column: string, ddl: string) {
  const cols = await attendanceColumns()
  if (cols.includes(column)) return
  try {
    await prisma.$executeRawUnsafe(ddl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('duplicate column')) throw err
  }
}

async function warningColumns(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>('PRAGMA table_info(warnings)')
  return rows.map((r) => r.name)
}

async function addWarningColumnIfMissing(column: string, ddl: string) {
  const cols = await warningColumns()
  if (cols.includes(column)) return
  try {
    await prisma.$executeRawUnsafe(ddl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('duplicate column')) throw err
  }
}

async function payrollColumns(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>('PRAGMA table_info(payrolls)')
  return rows.map((r) => r.name)
}

async function addPayrollColumnIfMissing(column: string, ddl: string) {
  const cols = await payrollColumns()
  if (cols.includes(column)) return
  try {
    await prisma.$executeRawUnsafe(ddl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('duplicate column')) throw err
  }
}
