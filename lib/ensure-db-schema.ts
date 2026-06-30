import { prisma } from '@/lib/prisma'
import { DEFAULT_COMPANY_BRANCHES, HQ_BRANCH_ID, NMA_BRANCH_ID } from '@/lib/company-branches'
import { seedDefaultOrgStructure } from '@/lib/default-org-structure'
import { seedDefaultOutsideWorkChain } from '@/lib/seed-outside-work-chain'
import { seedDefaultLeaveChain } from '@/lib/seed-default-leave-chain'
import { seedDefaultWeeklyPlanChain } from '@/lib/seed-default-weekly-plan-chain'
import { seedDefaultForgotScanChain } from '@/lib/seed-default-forgot-scan-chain'
import { migrateLegacyPendingApprovals } from '@/lib/migrate-legacy-approvals'
import { getDefaultRolePermissionSeed } from '@/lib/rbac'
import { pragmaColumnNames, addColumnIfMissing, runMigration, validateCriticalSchema } from '@/lib/migrations/core'

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

async function addUserColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('users', column, ddl)
}

async function runEnsure(): Promise<boolean> {
  console.log('[ENSURE START]')

  // ── Schema version tracking table (must be first) ───────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT NOT NULL PRIMARY KEY,
      version INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

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
      lat REAL,
      lng REAL,
      radiusMeters REAL NOT NULL DEFAULT 100,
      googleMapPlaceId TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  // Add geofence + Google Maps columns to existing company_branches table (idempotent)
  await addColumnIfMissing('company_branches', 'lat',              `ALTER TABLE company_branches ADD COLUMN lat REAL`)
  await addColumnIfMissing('company_branches', 'lng',              `ALTER TABLE company_branches ADD COLUMN lng REAL`)
  await addColumnIfMissing('company_branches', 'radiusMeters',     `ALTER TABLE company_branches ADD COLUMN radiusMeters REAL NOT NULL DEFAULT 100`)
  await addColumnIfMissing('company_branches', 'googleMapPlaceId', `ALTER TABLE company_branches ADD COLUMN googleMapPlaceId TEXT`)
  // Add branchId column to attendances table (idempotent)
  await addColumnIfMissing('attendances', 'branchId', `ALTER TABLE attendances ADD COLUMN branchId TEXT`)

  await addUserColumnIfMissing('nameEn',    `ALTER TABLE users ADD COLUMN nameEn TEXT`)
  await addUserColumnIfMissing('nickname',  `ALTER TABLE users ADD COLUMN nickname TEXT`)
  await addUserColumnIfMissing('prefix',    `ALTER TABLE users ADD COLUMN prefix TEXT`)
  await addUserColumnIfMissing('position',  `ALTER TABLE users ADD COLUMN position TEXT`)
  await addUserColumnIfMissing('profileImage', `ALTER TABLE users ADD COLUMN profileImage TEXT`)
  await addUserColumnIfMissing('branchId', `ALTER TABLE users ADD COLUMN branchId TEXT`)
  await addUserColumnIfMissing('addressIdCard', `ALTER TABLE users ADD COLUMN addressIdCard TEXT`)
  await addUserColumnIfMissing('employeeType', `ALTER TABLE users ADD COLUMN employeeType TEXT DEFAULT 'permanent_employee'`)
  await addUserColumnIfMissing('managerId', `ALTER TABLE users ADD COLUMN managerId TEXT`)
  await addUserColumnIfMissing('teamLeaderId', `ALTER TABLE users ADD COLUMN teamLeaderId TEXT`)
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
    const lat = b.lat ?? null
    const lng = b.lng ?? null
    const radius = b.radiusMeters ?? 100
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO company_branches (id, code, name, nameEn, address, isActive, isDefault, lat, lng, radiusMeters, createdAt, updatedAt)
      VALUES (${b.id}, ${b.code}, ${b.name}, ${b.nameEn}, ${b.address}, 1, ${b.isDefault ? 1 : 0}, ${lat}, ${lng}, ${radius}, datetime('now'), datetime('now'))
    `
    await prisma.$executeRaw`
      UPDATE company_branches
      SET code = ${b.code}, name = ${b.name}, nameEn = ${b.nameEn}, address = ${b.address},
          isActive = 1, isDefault = ${b.isDefault ? 1 : 0},
          lat = COALESCE(lat, ${lat}), lng = COALESCE(lng, ${lng}),
          radiusMeters = COALESCE(radiusMeters, ${radius}),
          updatedAt = datetime('now')
      WHERE id = ${b.id}
    `
  }

  // Force-correct wrong HQ branch coordinates seeded in earlier versions.
  // Only update if lat/lng matches one of the two known-wrong seed values:
  //   - 13.8511, 100.6596  (from old company-branches.ts default)
  //   - 13.8253, 100.6785  (from old CompanySettings seed / company-defaults.ts)
  //   - NULL               (never populated)
  // If admin has set a custom value (neither of the above), this is a no-op.
  await prisma.$executeRaw`
    UPDATE company_branches
    SET lat = 13.82965, lng = 100.67712, radiusMeters = 200, updatedAt = datetime('now')
    WHERE id = ${HQ_BRANCH_ID}
      AND (
        lat IS NULL
        OR (ABS(lat - 13.8511) < 0.001 AND ABS(lng - 100.6596) < 0.001)
        OR (ABS(lat - 13.8253) < 0.001 AND ABS(lng - 100.6785) < 0.001)
      )
  `

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
  // LINE OA fields — added after initial Turso push in some deployments
  await addUserColumnIfMissing('lineId', `ALTER TABLE users ADD COLUMN lineId TEXT`)
  await addUserColumnIfMissing('line_notif_settings', `ALTER TABLE users ADD COLUMN line_notif_settings TEXT`)
  // Approval workflow columns
  await addUserColumnIfMissing('approvedById', `ALTER TABLE users ADD COLUMN approvedById TEXT`)
  await addUserColumnIfMissing('approvedAt', `ALTER TABLE users ADD COLUMN approvedAt DATETIME`)
  // Phase 15 security columns — added to schema after initial Turso push
  await addUserColumnIfMissing('locked_until', `ALTER TABLE users ADD COLUMN locked_until DATETIME`)
  await addUserColumnIfMissing('password_changed_at', `ALTER TABLE users ADD COLUMN password_changed_at DATETIME`)
  await addUserColumnIfMissing('isCoworker', `ALTER TABLE users ADD COLUMN isCoworker INTEGER NOT NULL DEFAULT 0`)

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
  await addPayrollColumnIfMissing(
    'taxDeduction',
    `ALTER TABLE payrolls ADD COLUMN taxDeduction REAL NOT NULL DEFAULT 0`,
  )
  await addPayrollColumnIfMissing(
    'taxDetail',
    `ALTER TABLE payrolls ADD COLUMN taxDetail TEXT`,
  )
  await addPayrollColumnIfMissing(
    'approvedById',
    `ALTER TABLE payrolls ADD COLUMN approvedById TEXT`,
  )
  await addPayrollColumnIfMissing(
    'approvedAt',
    `ALTER TABLE payrolls ADD COLUMN approvedAt DATETIME`,
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
  // ── Auto-warning approval flow columns ──
  await addWarningColumnIfMissing(
    'status',
    `ALTER TABLE warnings ADD COLUMN status TEXT NOT NULL DEFAULT 'APPROVED'`,
  )
  await addWarningColumnIfMissing('expiredAt', `ALTER TABLE warnings ADD COLUMN expiredAt DATETIME`)
  await addWarningColumnIfMissing('approvedById', `ALTER TABLE warnings ADD COLUMN approvedById TEXT`)
  await addWarningColumnIfMissing('approvedAt', `ALTER TABLE warnings ADD COLUMN approvedAt DATETIME`)
  await addWarningColumnIfMissing('rejectedById', `ALTER TABLE warnings ADD COLUMN rejectedById TEXT`)
  await addWarningColumnIfMissing('rejectedAt', `ALTER TABLE warnings ADD COLUMN rejectedAt DATETIME`)
  await addWarningColumnIfMissing('rejectedReason', `ALTER TABLE warnings ADD COLUMN rejectedReason TEXT`)
  await addWarningColumnIfMissing('archivedAt', `ALTER TABLE warnings ADD COLUMN archivedAt DATETIME`)
  await addWarningColumnIfMissing('approvalNote', `ALTER TABLE warnings ADD COLUMN approvalNote TEXT`)
  await addWarningColumnIfMissing('lateCount', `ALTER TABLE warnings ADD COLUMN lateCount INTEGER`)

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
    CREATE TABLE IF NOT EXISTS salary_slips (
      id TEXT NOT NULL PRIMARY KEY,
      payrollId TEXT NOT NULL UNIQUE,
      userId TEXT NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      pdfBase64 TEXT,
      issuedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(userId, month, year)
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tax_history (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      annualGross REAL NOT NULL DEFAULT 0,
      incomeDeduction REAL NOT NULL DEFAULT 0,
      personalAllowance REAL NOT NULL DEFAULT 0,
      taxableIncome REAL NOT NULL DEFAULT 0,
      annualTax REAL NOT NULL DEFAULT 0,
      monthlyTax REAL NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(userId, month, year)
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS probation_evaluations (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL UNIQUE,
      result TEXT NOT NULL DEFAULT 'PENDING',
      notes TEXT,
      evaluatedById TEXT,
      evaluatedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS document_requests (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      purpose TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      notes TEXT,
      handledById TEXT,
      handledAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
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

  // ── Leave request: approval chain columns (added in db43056, no prior patch) ──
  await addLeaveRequestColumnIfMissing('chainConfigId',    `ALTER TABLE leave_requests ADD COLUMN chainConfigId TEXT`)
  await addLeaveRequestColumnIfMissing('currentStepOrder', `ALTER TABLE leave_requests ADD COLUMN currentStepOrder INTEGER NOT NULL DEFAULT 0`)

  await addColumnIfMissing('approval_chain_configs', 'entityType', `ALTER TABLE approval_chain_configs ADD COLUMN entityType TEXT NOT NULL DEFAULT 'LEAVE'`)

  await addOutsideWorkColumnIfMissing('chainConfigId',    `ALTER TABLE outside_work_requests ADD COLUMN chainConfigId TEXT`)
  await addOutsideWorkColumnIfMissing('currentStepOrder', `ALTER TABLE outside_work_requests ADD COLUMN currentStepOrder INTEGER NOT NULL DEFAULT 0`)

  // ── Approval chain tables (created by prisma db push in db43056 — ensure they exist) ──
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS approval_chain_configs (
      id TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      entityType TEXT NOT NULL DEFAULT 'LEAVE',
      isActive INTEGER NOT NULL DEFAULT 1,
      isDefault INTEGER NOT NULL DEFAULT 0,
      createdById TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS approval_chain_steps (
      id TEXT NOT NULL PRIMARY KEY,
      chainId TEXT NOT NULL,
      stepOrder INTEGER NOT NULL,
      stepName TEXT NOT NULL,
      approverRole TEXT,
      approverId TEXT,
      canSkip INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(chainId, stepOrder)
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS leave_approval_steps (
      id TEXT NOT NULL PRIMARY KEY,
      leaveRequestId TEXT NOT NULL,
      chainStepId TEXT NOT NULL,
      stepOrder INTEGER NOT NULL,
      stepName TEXT NOT NULL,
      approverRole TEXT,
      approverId TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      actorId TEXT,
      comment TEXT,
      ip TEXT,
      actedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS leave_approval_steps_request_idx ON leave_approval_steps (leaveRequestId)
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS outside_work_approval_steps (
      id TEXT NOT NULL PRIMARY KEY,
      requestId TEXT NOT NULL,
      chainStepId TEXT NOT NULL,
      stepOrder INTEGER NOT NULL,
      stepName TEXT NOT NULL,
      approverRole TEXT,
      approverId TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      actorId TEXT,
      comment TEXT,
      ip TEXT,
      actedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS outside_work_approval_steps_request_idx ON outside_work_approval_steps (requestId)
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS weekly_plan_approval_steps (
      id TEXT NOT NULL PRIMARY KEY,
      weekly_plan_id TEXT NOT NULL,
      chain_step_id TEXT NOT NULL,
      stepOrder INTEGER NOT NULL,
      stepName TEXT NOT NULL,
      approverRole TEXT,
      approverId TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      actorId TEXT,
      comment TEXT,
      ip TEXT,
      actedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS weekly_plan_approval_steps_plan_idx ON weekly_plan_approval_steps (weekly_plan_id)
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS forgot_scan_approval_steps (
      id TEXT NOT NULL PRIMARY KEY,
      forgot_scan_id TEXT NOT NULL,
      chain_step_id TEXT NOT NULL,
      stepOrder INTEGER NOT NULL,
      stepName TEXT NOT NULL,
      approverRole TEXT,
      approverId TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      actorId TEXT,
      comment TEXT,
      ip TEXT,
      actedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS forgot_scan_approval_steps_request_idx ON forgot_scan_approval_steps (forgot_scan_id)
  `)
  await addWeeklyPlanColumnIfMissing('chain_config_id', `ALTER TABLE weekly_lawyer_plans ADD COLUMN chain_config_id TEXT`)
  await addWeeklyPlanColumnIfMissing('current_step_order', `ALTER TABLE weekly_lawyer_plans ADD COLUMN current_step_order INTEGER NOT NULL DEFAULT 0`)
  await addForgotScanColumnIfMissing('chain_config_id', `ALTER TABLE forgot_scan_requests ADD COLUMN chain_config_id TEXT`)
  await addForgotScanColumnIfMissing('current_step_order', `ALTER TABLE forgot_scan_requests ADD COLUMN current_step_order INTEGER NOT NULL DEFAULT 0`)

  await seedDefaultOutsideWorkChain(prisma)
  await seedDefaultLeaveChain(prisma)
  await seedDefaultWeeklyPlanChain(prisma)
  await seedDefaultForgotScanChain(prisma)
  await migrateLegacyPendingApprovals(prisma)

  // ── Role Permissions (RBAC) ──────────────────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id TEXT NOT NULL PRIMARY KEY,
      role TEXT NOT NULL,
      permission TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(role, permission)
    )
  `)
  // Seed default role permissions (INSERT OR IGNORE = idempotent, won't overwrite custom ones)
  const seeds = getDefaultRolePermissionSeed()
  for (const { role, permission } of seeds) {
    const id = `${role}_${permission}`
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO role_permissions (id, role, permission, createdAt, updatedAt)
      VALUES (${id}, ${role}, ${permission}, datetime('now'), datetime('now'))
    `
  }

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
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      attachmentName TEXT,
      attachmentUrl TEXT,
      attachmentType TEXT,
      attachmentPublicId TEXT
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS announcements_created_idx ON announcements (createdAt)
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS announcements_archived_publish_idx ON announcements (isArchived, publishAt)
  `)

  // Announcement attachment columns (added in Announcement System V2)
  await addAnnouncementColumnIfMissing('attachmentName',     `ALTER TABLE announcements ADD COLUMN attachmentName TEXT`)
  await addAnnouncementColumnIfMissing('attachmentUrl',      `ALTER TABLE announcements ADD COLUMN attachmentUrl TEXT`)
  await addAnnouncementColumnIfMissing('attachmentType',     `ALTER TABLE announcements ADD COLUMN attachmentType TEXT`)
  await addAnnouncementColumnIfMissing('attachmentPublicId', `ALTER TABLE announcements ADD COLUMN attachmentPublicId TEXT`)

  // Attendance columns added after initial schema (idempotent — safe to run every deploy)
  await addAttendanceColumnIfMissing(
    'autoCheckout',
    `ALTER TABLE attendances ADD COLUMN autoCheckout INTEGER NOT NULL DEFAULT 0`,
  )
  await addAttendanceColumnIfMissing('note',       `ALTER TABLE attendances ADD COLUMN note TEXT`)
  await addAttendanceColumnIfMissing('editedById', `ALTER TABLE attendances ADD COLUMN editedById TEXT`)
  await addAttendanceColumnIfMissing('photoUrl',         `ALTER TABLE attendances ADD COLUMN photoUrl TEXT`)
  await addAttendanceColumnIfMissing('checkOutPhotoUrl', `ALTER TABLE attendances ADD COLUMN checkOutPhotoUrl TEXT`)
  await addAttendanceColumnIfMissing('lunchOutPhotoUrl', `ALTER TABLE attendances ADD COLUMN lunchOutPhotoUrl TEXT`)
  await addAttendanceColumnIfMissing('lunchInPhotoUrl',  `ALTER TABLE attendances ADD COLUMN lunchInPhotoUrl TEXT`)
  await addAttendanceColumnIfMissing(
    'lateMinutes',
    `ALTER TABLE attendances ADD COLUMN lateMinutes INTEGER NOT NULL DEFAULT 0`,
  )
  await addAttendanceColumnIfMissing(
    'earlyLeaveMinutes',
    `ALTER TABLE attendances ADD COLUMN earlyLeaveMinutes INTEGER NOT NULL DEFAULT 0`,
  )

  // Lunch overtime tracking (พักเกินเวลา)
  await addAttendanceColumnIfMissing(
    'lunchOverMinutes',
    `ALTER TABLE attendances ADD COLUMN lunchOverMinutes INTEGER NOT NULL DEFAULT 0`,
  )
  await addCompanySettingsColumnIfMissing(
    'lunchReturnTime',
    `ALTER TABLE company_settings ADD COLUMN lunchReturnTime TEXT NOT NULL DEFAULT '13:00'`,
  )

  // ── Weekly plan 2-step approval columns ──────────────────────────────────
  await addWeeklyPlanColumnIfMissing('approval_status',     `ALTER TABLE weekly_lawyer_plans ADD COLUMN approval_status TEXT`)
  await addWeeklyPlanColumnIfMissing('supervisor_comment',  `ALTER TABLE weekly_lawyer_plans ADD COLUMN supervisor_comment TEXT`)
  await addWeeklyPlanColumnIfMissing('executive_comment',   `ALTER TABLE weekly_lawyer_plans ADD COLUMN executive_comment TEXT`)

  // ── Outside work CEO approval columns ────────────────────────────────────
  await addOutsideWorkColumnIfMissing('approval_status', `ALTER TABLE outside_work_requests ADD COLUMN approval_status TEXT`)
  await addOutsideWorkColumnIfMissing('google_maps_url', `ALTER TABLE outside_work_requests ADD COLUMN google_maps_url TEXT`)
  await addOutsideWorkColumnIfMissing('attachment_url',  `ALTER TABLE outside_work_requests ADD COLUMN attachment_url TEXT`)
  await addOutsideWorkColumnIfMissing('attachment_name', `ALTER TABLE outside_work_requests ADD COLUMN attachment_name TEXT`)

  // ── Outside work Excel form fields ───────────────────────────────────────
  await addOutsideWorkColumnIfMissing('employee_name',  `ALTER TABLE outside_work_requests ADD COLUMN employee_name TEXT`)
  await addOutsideWorkColumnIfMissing('owner_name',     `ALTER TABLE outside_work_requests ADD COLUMN owner_name TEXT`)
  await addOutsideWorkColumnIfMissing('work_type',      `ALTER TABLE outside_work_requests ADD COLUMN work_type TEXT`)
  await addOutsideWorkColumnIfMissing('distance',       `ALTER TABLE outside_work_requests ADD COLUMN distance REAL`)
  await addOutsideWorkColumnIfMissing('distance_limit', `ALTER TABLE outside_work_requests ADD COLUMN distance_limit REAL`)
  await addOutsideWorkColumnIfMissing('route_type',     `ALTER TABLE outside_work_requests ADD COLUMN route_type TEXT`)

  // ── Weekly plan day GPS columns ───────────────────────────────────────────
  await addWeeklyPlanDayColumnIfMissing('plan_lat', `ALTER TABLE weekly_plan_days ADD COLUMN plan_lat REAL`)
  await addWeeklyPlanDayColumnIfMissing('plan_lng', `ALTER TABLE weekly_plan_days ADD COLUMN plan_lng REAL`)

  // ── Attendance weekly plan location tracking columns ──────────────────────
  await addAttendanceColumnIfMissing('weekly_plan_day_id', `ALTER TABLE attendances ADD COLUMN weekly_plan_day_id TEXT`)
  await addAttendanceColumnIfMissing('planned_lat',        `ALTER TABLE attendances ADD COLUMN planned_lat REAL`)
  await addAttendanceColumnIfMissing('planned_lng',        `ALTER TABLE attendances ADD COLUMN planned_lng REAL`)
  await addAttendanceColumnIfMissing('planned_place',      `ALTER TABLE attendances ADD COLUMN planned_place TEXT`)
  await addAttendanceColumnIfMissing('location_distance',  `ALTER TABLE attendances ADD COLUMN location_distance REAL`)
  await addAttendanceColumnIfMissing('location_status',    `ALTER TABLE attendances ADD COLUMN location_status TEXT`)

  // ── Phase 15 — Enterprise Security tables ────────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id TEXT NOT NULL PRIMARY KEY,
      email TEXT NOT NULL,
      ip TEXT,
      userAgent TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      userId TEXT,
      reason TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS login_attempts_email_created_idx ON login_attempts (email, createdAt)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS login_attempts_user_idx ON login_attempts (userId)`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT,
      eventType TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'INFO',
      description TEXT NOT NULL,
      ip TEXT,
      userAgent TEXT,
      metadata TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS security_events_user_created_idx ON security_events (userId, createdAt)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS security_events_severity_idx ON security_events (severity)`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS two_factor_setups (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 0,
      channel TEXT NOT NULL DEFAULT 'LINE',
      totp_secret TEXT,
      enabled_at DATETIME,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS device_sessions (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL,
      sessionId TEXT NOT NULL UNIQUE,
      ip TEXT,
      userAgent TEXT,
      browser TEXT,
      os TEXT,
      deviceType TEXT,
      country TEXT,
      isRevoked INTEGER NOT NULL DEFAULT 0,
      last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS device_sessions_user_idx ON device_sessions (userId)`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL,
      challenge TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'LINE',
      used INTEGER NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS otp_codes_user_idx ON otp_codes (userId)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS otp_codes_challenge_idx ON otp_codes (challenge)`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS backup_records (
      id TEXT NOT NULL PRIMARY KEY,
      filename TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      tables TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      created_by_id TEXT,
      note TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS backup_records_created_idx ON backup_records (createdAt)`)

  // ── Client Portal Phase 1 tables ─────────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS client_portal_users (
      id TEXT NOT NULL PRIMARY KEY,
      client_company_id TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS cpu_company_idx ON client_portal_users (client_company_id)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS cpu_email_idx ON client_portal_users (email)`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS client_portal_logs (
      id TEXT NOT NULL PRIMARY KEY,
      portal_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      meta TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS cpl_user_idx ON client_portal_logs (portal_user_id)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS cpl_created_idx ON client_portal_logs (created_at)`)

  // ── Demo accounts — idempotent, never overwrites existing rows ────────────
  // Hash of 'demo1234' with bcrypt cost 12 (pre-computed to avoid runtime cost)
  const DEMO_HASH = '$2a$12$MYyHT55yC2oo6zvB2ot2iu9bG6Xeu1egcNQbcMZ8H5bkz69cd8jqq'
  const DEMO_BRANCH = 'branch-hq-kmsp'
  const demoAccounts = [
    { id: 'demo-manager',  email: 'manager@demo.com',  name: 'Manager Demo',  role: 'MANAGER_HR' },
    { id: 'demo-admin',    email: 'admin@demo.com',    name: 'Admin Demo',    role: 'ADMIN' },
    { id: 'demo-employee', email: 'employee@demo.com', name: 'Employee Demo', role: 'EMPLOYEE' },
    { id: 'demo-lawyer',   email: 'lawyer@demo.com',   name: 'Lawyer Demo',   role: 'LAWYER' },
  ] as const
  for (const u of demoAccounts) {
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO users
        (id, email, passwordHash, name, role, status, branchId, socialSecurity, createdAt, updatedAt)
      VALUES
        (${u.id}, ${u.email}, ${DEMO_HASH}, ${u.name}, ${u.role}, 'ACTIVE', ${DEMO_BRANCH}, 1, datetime('now'), datetime('now'))
    `
    console.log('[DEMO USER INSERTED]', u.email)
  }

  // ── Record baseline migration (marks this DB as having all patches applied) ──
  await runMigration(0, 'baseline-all-column-patches', async () => {
    // All patches above are idempotent PRAGMA-based; this entry just tracks the baseline.
  })

  // ── Migration 1: case_documents missing columns from Phase 4 migration ───────
  // migrate-turso-case-documents.mjs omitted is_archived, category, case_id,
  // debtor_id, and client_id — Prisma always queries them so the GET handler
  // throws "no such column" on every request, causing a 500 → non-JSON body →
  // res.json() SyntaxError → toast 'โหลดข้อมูลไม่สำเร็จ' on every device.
  await runMigration(1, 'case-documents-missing-columns', async () => {
    for (const ddl of [
      `ALTER TABLE case_documents ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE case_documents ADD COLUMN category     TEXT NOT NULL DEFAULT 'OTHER'`,
      `ALTER TABLE case_documents ADD COLUMN case_id      TEXT`,
      `ALTER TABLE case_documents ADD COLUMN debtor_id    TEXT`,
      `ALTER TABLE case_documents ADD COLUMN client_id    TEXT`,
    ]) {
      try { await prisma.$executeRawUnsafe(ddl) } catch { /* column already exists */ }
    }
  })

  // ── Migration 2: case_document_files missing Cloudinary columns ──────────────
  // Prisma selects all model fields in every `include: { files: ... }` call.
  // secure_url, mime_type, resource_type, format are nullable so missing rows
  // read as NULL once the columns exist — no data loss.
  await runMigration(2, 'case-document-files-cloudinary-columns', async () => {
    for (const ddl of [
      `ALTER TABLE case_document_files ADD COLUMN secure_url    TEXT`,
      `ALTER TABLE case_document_files ADD COLUMN mime_type     TEXT`,
      `ALTER TABLE case_document_files ADD COLUMN resource_type TEXT`,
      `ALTER TABLE case_document_files ADD COLUMN format        TEXT`,
    ]) {
      try { await prisma.$executeRawUnsafe(ddl) } catch { /* column already exists */ }
    }
  })

  // ── outside_work_requests — ฟอร์มบริษัท ฉ.2 columns ──────────────────────
  await addColumnIfMissing('outside_work_requests', 'time_slot',    `ALTER TABLE outside_work_requests ADD COLUMN time_slot TEXT`)
  await addColumnIfMissing('outside_work_requests', 'case_number',  `ALTER TABLE outside_work_requests ADD COLUMN case_number TEXT`)
  await addColumnIfMissing('outside_work_requests', 'product_work', `ALTER TABLE outside_work_requests ADD COLUMN product_work TEXT`)
  await addColumnIfMissing('outside_work_requests', 'work_branch',  `ALTER TABLE outside_work_requests ADD COLUMN work_branch TEXT`)
  await addColumnIfMissing('outside_work_requests', 'case_count',   `ALTER TABLE outside_work_requests ADD COLUMN case_count INTEGER`)
  await addColumnIfMissing('outside_work_requests', 'admin_checked',   `ALTER TABLE outside_work_requests ADD COLUMN admin_checked TEXT`)
  await addColumnIfMissing('outside_work_requests', 'supervised_by',   `ALTER TABLE outside_work_requests ADD COLUMN supervised_by TEXT`)
  await addColumnIfMissing('outside_work_requests', 'document_number', `ALTER TABLE outside_work_requests ADD COLUMN document_number TEXT`)

  // ── Query-performance indexes ─────────────────────────────────────────────
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_attendances_userId_date   ON attendances (userId, date)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_attendances_branchId_date ON attendances (branchId, date)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_outside_work_userId       ON outside_work_requests (userId)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_outside_work_date         ON outside_work_requests (date)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_outside_work_status       ON outside_work_requests (status)`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_outside_work_doc_num ON outside_work_requests (document_number) WHERE document_number IS NOT NULL`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_leave_requests_userId     ON leave_requests (userId)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_leave_requests_status     ON leave_requests (status)`)

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx ON audit_logs (actorId, createdAt)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS audit_logs_target_created_idx ON audit_logs (targetId, createdAt)`)

  // ── Startup schema validation — warns but never crashes ──────────────────────
  await validateCriticalSchema()

  console.log('[ENSURE COMPLETE]')
  return true
}

// ── Column helpers — all delegate to addColumnIfMissing ───────────────────────

async function addUserFaceProfileColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('user_face_profiles', column, ddl)
}
async function addCompanySettingsColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('company_settings', column, ddl)
}
async function addFaceScanColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('attendance_face_scans', column, ddl)
}
async function addLineNotifyColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('attendance_line_notify_logs', column, ddl)
}
async function addAttendanceColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('attendances', column, ddl)
}
async function addWarningColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('warnings', column, ddl)
}
async function addPayrollColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('payrolls', column, ddl)
}
async function addWeeklyPlanColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('weekly_lawyer_plans', column, ddl)
}
async function addWeeklyPlanDayColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('weekly_plan_days', column, ddl)
}
async function addOutsideWorkColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('outside_work_requests', column, ddl)
}
async function addLeaveRequestColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('leave_requests', column, ddl)
}
async function addForgotScanColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('forgot_scan_requests', column, ddl)
}
async function addAnnouncementColumnIfMissing(column: string, ddl: string) {
  await addColumnIfMissing('announcements', column, ddl)
}

/** รองรับหลายรอบเช็คอินต่อวัน — เปลี่ยน unique จาก (userId,date) เป็น (userId,date,sessionIndex) */
async function migrateAttendanceMultiSessionUnique() {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>('PRAGMA table_info(attendances)')
  const cols = rows.map(r => r.name)
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
