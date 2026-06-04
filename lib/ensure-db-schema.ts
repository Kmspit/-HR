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

function pragmaColumnNames(rows: unknown[]): string[] {
  return rows
    .map((row) => {
      if (row && typeof row === 'object') {
        const r = row as Record<string, unknown>
        if (typeof r.name === 'string') return r.name
        if (Array.isArray(row) && row[1] != null) return String(row[1])
      }
      return ''
    })
    .filter(Boolean)
}

async function userColumns(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<unknown[]>('PRAGMA table_info(users)')
  return pragmaColumnNames(rows)
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
  await addUserColumnIfMissing(
    'profileCloudinaryPublicId',
    `ALTER TABLE users ADD COLUMN profileCloudinaryPublicId TEXT`,
  )
  await addUserColumnIfMissing(
    'profileSecureUrl',
    `ALTER TABLE users ADD COLUMN profileSecureUrl TEXT`,
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
  await addUserFaceProfileColumnIfMissing('employeeId', `ALTER TABLE user_face_profiles ADD COLUMN employeeId TEXT`)
  await addUserFaceProfileColumnIfMissing('faceEmbedding', `ALTER TABLE user_face_profiles ADD COLUMN faceEmbedding TEXT`)
  await addUserFaceProfileColumnIfMissing(
    'cloudinaryPublicId',
    `ALTER TABLE user_face_profiles ADD COLUMN cloudinaryPublicId TEXT`,
  )
  await addUserFaceProfileColumnIfMissing('faceImageUrl', `ALTER TABLE user_face_profiles ADD COLUMN faceImageUrl TEXT`)
  await addUserFaceProfileColumnIfMissing('secureUrl', `ALTER TABLE user_face_profiles ADD COLUMN secureUrl TEXT`)
  await addUserFaceProfileColumnIfMissing(
    'isActive',
    `ALTER TABLE user_face_profiles ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1`,
  )
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

  // Cloudinary image fields (req: image_public_id, image_url)
  await addAttendanceColumnIfMissing('image_public_id', `ALTER TABLE attendances ADD COLUMN image_public_id TEXT`)
  await addAttendanceColumnIfMissing('image_url', `ALTER TABLE attendances ADD COLUMN image_url TEXT`)

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
  await addAttendanceColumnIfMissing(
    'approved',
    `ALTER TABLE attendances ADD COLUMN approved INTEGER NOT NULL DEFAULT 1`,
  )
  await addAttendanceColumnIfMissing(
    'attendanceStatus',
    `ALTER TABLE attendances ADD COLUMN attendanceStatus TEXT NOT NULL DEFAULT 'completed'`,
  )
  await addAttendanceColumnIfMissing(
    'sessionIndex',
    `ALTER TABLE attendances ADD COLUMN sessionIndex INTEGER NOT NULL DEFAULT 1`,
  )
  await addAttendanceColumnIfMissing(
    'checkInDistanceM',
    `ALTER TABLE attendances ADD COLUMN checkInDistanceM REAL`,
  )
  await addAttendanceColumnIfMissing(
    'gpsAccuracy',
    `ALTER TABLE attendances ADD COLUMN gpsAccuracy REAL`,
  )
  await addAttendanceColumnIfMissing(
    'gpsFlags',
    `ALTER TABLE attendances ADD COLUMN gpsFlags TEXT`,
  )
  await addAttendanceColumnIfMissing(
    'deviceInfo',
    `ALTER TABLE attendances ADD COLUMN deviceInfo TEXT`,
  )
  await addAttendanceColumnIfMissing(
    'outsideWorkRequestId',
    `ALTER TABLE attendances ADD COLUMN outsideWorkRequestId TEXT`,
  )
  await migrateAttendanceMultiSessionUnique()

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

  await addLineNotifyColumnIfMissing('faceScanId', `ALTER TABLE attendance_line_notify_logs ADD COLUMN faceScanId TEXT`)
  await addLineNotifyColumnIfMissing('employeeId', `ALTER TABLE attendance_line_notify_logs ADD COLUMN employeeId TEXT`)
  await addLineNotifyColumnIfMissing('scanType', `ALTER TABLE attendance_line_notify_logs ADD COLUMN scanType TEXT`)
  await addLineNotifyColumnIfMissing('imageUrl', `ALTER TABLE attendance_line_notify_logs ADD COLUMN imageUrl TEXT`)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS attendance_line_notify_dedup_idx
    ON attendance_line_notify_logs (attendanceId, eventType, status)
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS attendance_face_scans (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL,
      attendanceId TEXT,
      faceLogId TEXT,
      scanType TEXT NOT NULL,
      scanTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      confidenceScore REAL,
      matchScore REAL,
      livenessScore REAL,
      matched INTEGER NOT NULL DEFAULT 1,
      imageMime TEXT NOT NULL DEFAULT 'image/jpeg',
      imageData TEXT NOT NULL,
      locationName TEXT,
      address TEXT,
      lat REAL,
      lng REAL,
      deviceInfo TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS attendance_face_scans_user_time_idx
    ON attendance_face_scans (userId, scanTime)
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS attendance_face_scans_type_time_idx
    ON attendance_face_scans (scanType, scanTime)
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS attendance_face_scans_attendance_idx
    ON attendance_face_scans (attendanceId)
  `)

  await addFaceScanColumnIfMissing(
    'storageProvider',
    `ALTER TABLE attendance_face_scans ADD COLUMN storageProvider TEXT NOT NULL DEFAULT 'db'`,
  )
  await addFaceScanColumnIfMissing(
    'objectKey',
    `ALTER TABLE attendance_face_scans ADD COLUMN objectKey TEXT`,
  )
  const faceScanCloudinaryCols: [string, string][] = [
    ['employeeId', `ALTER TABLE attendance_face_scans ADD COLUMN employeeId TEXT`],
    ['companyId', `ALTER TABLE attendance_face_scans ADD COLUMN companyId TEXT`],
    ['branchId', `ALTER TABLE attendance_face_scans ADD COLUMN branchId TEXT`],
    ['cloudinaryPublicId', `ALTER TABLE attendance_face_scans ADD COLUMN cloudinaryPublicId TEXT`],
    ['imageUrl', `ALTER TABLE attendance_face_scans ADD COLUMN imageUrl TEXT`],
    ['secureUrl', `ALTER TABLE attendance_face_scans ADD COLUMN secureUrl TEXT`],
    ['format', `ALTER TABLE attendance_face_scans ADD COLUMN format TEXT`],
    ['fileSize', `ALTER TABLE attendance_face_scans ADD COLUMN fileSize INTEGER`],
    ['width', `ALTER TABLE attendance_face_scans ADD COLUMN width INTEGER`],
    ['height', `ALTER TABLE attendance_face_scans ADD COLUMN height INTEGER`],
    ['faceMatched', `ALTER TABLE attendance_face_scans ADD COLUMN faceMatched INTEGER NOT NULL DEFAULT 1`],
    ['location', `ALTER TABLE attendance_face_scans ADD COLUMN location TEXT`],
    ['latitude', `ALTER TABLE attendance_face_scans ADD COLUMN latitude REAL`],
    ['longitude', `ALTER TABLE attendance_face_scans ADD COLUMN longitude REAL`],
  ]
  for (const [col, ddl] of faceScanCloudinaryCols) {
    await addFaceScanColumnIfMissing(col, ddl)
  }

  await addCompanySettingsColumnIfMissing(
    'imageRetentionDays',
    `ALTER TABLE company_settings ADD COLUMN imageRetentionDays INTEGER NOT NULL DEFAULT 90`,
  )
  await addCompanySettingsColumnIfMissing(
    'probationMonths',
    `ALTER TABLE company_settings ADD COLUMN probationMonths INTEGER NOT NULL DEFAULT 3`,
  )

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS leave_policies (
      id TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT,
      isDefault INTEGER NOT NULL DEFAULT 0,
      sickDays INTEGER NOT NULL DEFAULT 30,
      vacationDays INTEGER NOT NULL DEFAULT 6,
      personalDays INTEGER NOT NULL DEFAULT 3,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT NOT NULL PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'GENERAL',
      targetType TEXT NOT NULL DEFAULT 'ALL',
      targetIds TEXT,
      publishAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      readByIds TEXT,
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdById TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS announcements_created_idx ON announcements (createdAt)
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS announcements_archived_publish_idx ON announcements (isArchived, publishAt)
  `)

  return true
}

async function userFaceProfileColumns(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<unknown[]>(
    'PRAGMA table_info(user_face_profiles)',
  )
  return pragmaColumnNames(rows)
}

async function addUserFaceProfileColumnIfMissing(column: string, ddl: string) {
  const cols = await userFaceProfileColumns()
  if (cols.includes(column)) return
  try {
    await prisma.$executeRawUnsafe(ddl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('duplicate column')) throw err
  }
}

async function companySettingsColumns(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<unknown[]>(
    'PRAGMA table_info(company_settings)',
  )
  return pragmaColumnNames(rows)
}

async function addCompanySettingsColumnIfMissing(column: string, ddl: string) {
  const cols = await companySettingsColumns()
  if (cols.includes(column)) return
  try {
    await prisma.$executeRawUnsafe(ddl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('duplicate column')) throw err
  }
}

async function faceScanColumns(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<unknown[]>(
    'PRAGMA table_info(attendance_face_scans)',
  )
  return pragmaColumnNames(rows)
}

async function addFaceScanColumnIfMissing(column: string, ddl: string) {
  const cols = await faceScanColumns()
  if (cols.includes(column)) return
  try {
    await prisma.$executeRawUnsafe(ddl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('duplicate column')) throw err
  }
}

async function lineNotifyColumns(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    'PRAGMA table_info(attendance_line_notify_logs)',
  )
  return rows.map((r) => r.name)
}

async function addLineNotifyColumnIfMissing(column: string, ddl: string) {
  const cols = await lineNotifyColumns()
  if (cols.includes(column)) return
  try {
    await prisma.$executeRawUnsafe(ddl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('duplicate column')) throw err
  }
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

/** รองรับหลายรอบเช็คอินต่อวัน — เปลี่ยน unique จาก (userId,date) เป็น (userId,date,sessionIndex) */
async function migrateAttendanceMultiSessionUnique() {
  const cols = await attendanceColumns()
  if (!cols.includes('sessionIndex')) return

  const indexes = await prisma.$queryRawUnsafe<{ name: string; sql: string }[]>(
    `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'attendances'`,
  )
  const hasNew = indexes.some(
    (i) =>
      i.name.includes('userId_date_sessionIndex') ||
      (i.sql?.includes('sessionIndex') && i.sql?.includes('UNIQUE')),
  )
  if (hasNew) return

  const oldUnique = indexes.find(
    (i) =>
      i.name.includes('userId_date') &&
      !i.name.includes('sessionIndex') &&
      i.sql?.toUpperCase().includes('UNIQUE'),
  )
  if (oldUnique) {
    try {
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${oldUnique.name}"`)
    } catch (err) {
      console.warn('[ensureDbSchema] drop old attendance unique', err)
    }
  }

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS attendances_userId_date_sessionIndex_key
    ON attendances (userId, date, sessionIndex)
  `)
}
