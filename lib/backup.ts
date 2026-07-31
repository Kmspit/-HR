/**
 * JSON backup system — Phase 15 (rebuilt)
 * Exports Tier-1 business-data tables as JSON, stored durably in Cloudinary
 * (not re-computed on download). No raw SQLite dump (serverless-safe).
 *
 * BACKUP_TABLE_SPECS' `accessor` values are Prisma Client's actual singular
 * camelCase model accessors (e.g. `prisma.leaveRequest`) — NOT the @@map'd
 * snake_case table name. The two were previously confused, which made every
 * table lookup resolve to `undefined` and produced 96 consecutive empty
 * backups; see git history for the incident.
 *
 * Scope is deliberately Tier 1 (core business data) rather than all ~107
 * tables — excluded: auth/session churn (login_attempts, otp_codes,
 * two_factor_setups, device_sessions), pure audit/log tables (security_events,
 * audit_logs, activity_logs, client_portal_logs, automation_execution_logs),
 * and notifications (regenerable from the business records themselves). Large
 * inline blob columns (scan images, rendered PDFs) are omitted per-table via
 * Prisma's `omit` — the durable copy of those already lives in Cloudinary.
 */
import { prisma } from '@/lib/prisma'
import { uploadBackupJson, fetchBackupJson, backupFolder, requireCloudinary } from '@/lib/cloudinary-service'
import { logSecurityEvent } from '@/lib/security-events'
import { createNotification } from '@/lib/notifications'

type BackupTableSpec = {
  /** @@map'd snake_case table name — used as the JSON key and for restore lookups */
  table: string
  /** Prisma Client's actual singular camelCase accessor */
  accessor: string
  /** Field names to omit from each row (large inline blobs already durably stored elsewhere) */
  omit?: Record<string, true>
}

export const BACKUP_TABLE_SPECS: BackupTableSpec[] = [
  // ── Org structure ──────────────────────────────────────────────────────
  { table: 'users',                    accessor: 'user' },
  { table: 'company_branches',         accessor: 'companyBranch' },
  { table: 'company_holidays',         accessor: 'companyHoliday' },
  { table: 'divisions',                accessor: 'division' },
  { table: 'departments',              accessor: 'department' },
  { table: 'sections',                 accessor: 'section' },
  { table: 'company_settings',         accessor: 'companySettings' },
  { table: 'leave_policies',           accessor: 'leavePolicy' },
  { table: 'user_face_profiles',       accessor: 'userFaceProfile' },

  // ── Attendance ──────────────────────────────────────────────────────────
  { table: 'attendances',              accessor: 'attendance' },
  { table: 'attendance_face_scans',    accessor: 'attendanceFaceScan', omit: { imageData: true } },
  { table: 'saved_work_places',        accessor: 'savedWorkPlace' },

  // ── Leave / outside-work / weekly-plan / forgot-scan ───────────────────
  { table: 'leave_requests',                accessor: 'leaveRequest' },
  { table: 'leave_balances',                accessor: 'leaveBalance' },
  { table: 'outside_work_requests',         accessor: 'outsideWorkRequest' },
  { table: 'outside_work_assignees',        accessor: 'outsideWorkAssignee' },
  { table: 'weekly_lawyer_plans',           accessor: 'weeklyLawyerPlan' },
  { table: 'weekly_plan_days',              accessor: 'weeklyPlanDay' },
  { table: 'forgot_scan_requests',          accessor: 'forgotScanRequest' },
  { table: 'approval_chain_configs',        accessor: 'approvalChainConfig' },
  { table: 'approval_chain_steps',          accessor: 'approvalChainStep' },
  { table: 'leave_approval_steps',          accessor: 'leaveApprovalStep' },
  { table: 'outside_work_approval_steps',   accessor: 'outsideWorkApprovalStep' },
  { table: 'weekly_plan_approval_steps',    accessor: 'weeklyPlanApprovalStep' },
  { table: 'forgot_scan_approval_steps',    accessor: 'forgotScanApprovalStep' },
  { table: 'approval_requests',             accessor: 'approvalRequest' },
  { table: 'approval_request_steps',        accessor: 'approvalRequestStep' },

  // ── Tasks ───────────────────────────────────────────────────────────────
  { table: 'task_assignments',   accessor: 'taskAssignment' },
  { table: 'task_attachments',   accessor: 'taskAttachment' },
  { table: 'task_comments',      accessor: 'taskComment' },
  { table: 'task_checklists',    accessor: 'taskChecklist' },
  { table: 'task_timelines',     accessor: 'taskTimeline' },
  { table: 'task_dependencies',  accessor: 'taskDependency' },

  // ── HR records ──────────────────────────────────────────────────────────
  { table: 'payrolls',               accessor: 'payroll' },
  { table: 'salary_slips',           accessor: 'salarySlip', omit: { pdfBase64: true } },
  { table: 'probation_evaluations',  accessor: 'probationEvaluation' },
  { table: 'document_requests',      accessor: 'documentRequest' },
  { table: 'warnings',               accessor: 'warning', omit: { pdfBase64: true } },
  { table: 'warning_rules',          accessor: 'warningRule' },
  { table: 'company_rules',          accessor: 'companyRule' },
  { table: 'announcements',          accessor: 'announcement' },
  { table: 'tax_history',            accessor: 'taxHistory' },

  // ── Case management ─────────────────────────────────────────────────────
  { table: 'cases',                    accessor: 'case' },
  { table: 'case_clients',             accessor: 'caseClient' },
  { table: 'case_debtors',             accessor: 'caseDebtor' },
  { table: 'case_courts',              accessor: 'caseCourt' },
  { table: 'case_timelines',           accessor: 'caseTimeline' },
  { table: 'case_checklists',          accessor: 'caseChecklist' },
  { table: 'case_debtor_activities',   accessor: 'caseDebtorActivity' },
  { table: 'case_documents',           accessor: 'caseDocument' },
  { table: 'case_document_files',      accessor: 'caseDocumentFile' },
  { table: 'case_document_signatures', accessor: 'caseDocumentSignature' },
  { table: 'case_document_versions',   accessor: 'caseDocumentVersion' },
  { table: 'case_status_history',      accessor: 'caseStatusHistory' },
  { table: 'case_incomes',             accessor: 'caseIncome' },
  { table: 'case_expenses',            accessor: 'caseExpense' },
  { table: 'case_financials',          accessor: 'caseFinancial' },
  { table: 'court_events',             accessor: 'courtEvent' },
  { table: 'calendar_events',          accessor: 'calendarEvent' },
  { table: 'client_messages',          accessor: 'clientMessage' },

  // ── Debt / recovery ─────────────────────────────────────────────────────
  { table: 'debtors',              accessor: 'debtor' },
  { table: 'debt_follow_ups',      accessor: 'debtFollowUp' },
  { table: 'debt_payments',        accessor: 'debtPayment' },
  { table: 'payment_appointments', accessor: 'paymentAppointment' },
  { table: 'debtor_files',         accessor: 'debtorFile' },
  { table: 'debtor_contacts',      accessor: 'debtorContact' },
  { table: 'promises_to_pay',      accessor: 'promiseToPay' },
  { table: 'recovery_payments',    accessor: 'recoveryPayment' },

  // ── Clients / contracts / portal ────────────────────────────────────────
  { table: 'client_companies',      accessor: 'clientCompany' },
  { table: 'client_contracts',      accessor: 'clientContract' },
  { table: 'client_sla_records',    accessor: 'clientSlaRecord' },
  { table: 'client_company_files',  accessor: 'clientCompanyFile' },
  { table: 'client_portal_users',   accessor: 'clientPortalUser' },

  // ── Billing / expenses ──────────────────────────────────────────────────
  { table: 'billing_invoices', accessor: 'billingInvoice' },
  { table: 'billing_payments', accessor: 'billingPayment' },
  { table: 'billing_receipts', accessor: 'billingReceipt' },
  { table: 'expense_claims',      accessor: 'expenseClaim' },
  { table: 'expense_claim_files', accessor: 'expenseClaimFile' },

  // ── Signatures ───────────────────────────────────────────────────────────
  { table: 'digital_signatures', accessor: 'digitalSignature' },

  // ── Automation (config, currently near-empty) ─────────────────────────────
  { table: 'automation_rules',         accessor: 'automationRule' },
]

export const BACKUP_TABLE_NAMES: string[] = BACKUP_TABLE_SPECS.map((s) => s.table)

type BackupData = Record<string, unknown[]>

export type CreateBackupResult = {
  data: BackupData
  /** table -> error message, only present for tables that genuinely failed */
  errors: Record<string, string>
}

export async function createBackupData(tableNames: string[] = BACKUP_TABLE_NAMES): Promise<CreateBackupResult> {
  const data: BackupData = {}
  const errors: Record<string, string> = {}
  const specByTable = new Map(BACKUP_TABLE_SPECS.map((s) => [s.table, s]))

  for (const tableName of tableNames) {
    const spec = specByTable.get(tableName)
    if (!spec) {
      errors[tableName] = 'unknown table (not in BACKUP_TABLE_SPECS)'
      continue
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = (prisma as any)[spec.accessor]
      if (!model || typeof model.findMany !== 'function') {
        throw new Error(`prisma.${spec.accessor} is not a valid model accessor`)
      }
      const rows = await model.findMany(spec.omit ? { omit: spec.omit } : undefined)
      data[tableName] = rows
    } catch (err) {
      data[tableName] = []
      errors[tableName] = err instanceof Error ? err.message : String(err)
      console.error(`[backup] table "${tableName}" (accessor "${spec.accessor}") failed:`, err)
    }
  }

  return { data, errors }
}

/** table -> Cloudinary publicId. `storagePublicId` holds this JSON-encoded when the
 *  backup is split per-table. A bare (non-JSON) string in that same column means a
 *  legacy single-combined-file backup — every loader below falls back to that. */
export type BackupManifest = Record<string, string>

function parseManifest(storagePublicId: string): BackupManifest | null {
  try {
    const parsed = JSON.parse(storagePublicId)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as BackupManifest) : null
  } catch {
    return null
  }
}

/** Uploads each table as its own Cloudinary file instead of one combined blob — a
 *  single fast-growing table (e.g. attendances) can now grow for decades before it
 *  alone approaches the 50MB-per-file cap, instead of sharing one 50MB budget across
 *  all ~84 tables combined. Fails fast (no per-table retries) if Cloudinary itself
 *  isn't reachable/configured, since every subsequent call would fail identically. */
export async function storeBackupTables(
  data: BackupData,
  filenameBase: string,
): Promise<{ manifest: BackupManifest; sizeBytes: number; uploadErrors: Record<string, string> }> {
  requireCloudinary()

  const manifest: BackupManifest = {}
  const uploadErrors: Record<string, string> = {}
  let sizeBytes = 0

  for (const [table, rows] of Object.entries(data)) {
    const json = JSON.stringify(rows)
    sizeBytes += Buffer.byteLength(json, 'utf8')
    try {
      const { publicId } = await uploadBackupJson(Buffer.from(json, 'utf8'), {
        folder:   backupFolder(),
        filename: `${filenameBase.replace(/\.json$/, '')}__${table}.json`,
      })
      manifest[table] = publicId
    } catch (err) {
      uploadErrors[table] = err instanceof Error ? err.message : String(err)
      console.error(`[backup] upload of table "${table}" failed:`, err)
    }
  }

  return { manifest, sizeBytes, uploadErrors }
}

/** Full combined payload — used by the "download whole backup" feature. Manifest
 *  backups are reassembled from their per-table files; a table whose file is
 *  missing/corrupt is silently omitted rather than failing the whole download. */
export async function loadBackupPayload(storagePublicId: string): Promise<BackupData | null> {
  const manifest = parseManifest(storagePublicId)
  if (manifest) {
    const data: BackupData = {}
    for (const [table, publicId] of Object.entries(manifest)) {
      const buf = await fetchBackupJson(publicId)
      if (!buf) continue
      try { data[table] = JSON.parse(buf.toString('utf8')) as unknown[] } catch { /* skip corrupt file */ }
    }
    return Object.keys(data).length ? data : null
  }

  // Legacy single-combined-file backup
  const buf = await fetchBackupJson(storagePublicId)
  if (!buf) return null
  try {
    return JSON.parse(buf.toString('utf8')) as BackupData
  } catch {
    return null
  }
}

/** Loads just one table's rows — for manifest backups this fetches a single small
 *  file instead of the whole combined payload, which is what restore actually needs. */
export async function loadBackupTable(storagePublicId: string, table: string): Promise<unknown[] | null> {
  const manifest = parseManifest(storagePublicId)
  if (manifest) {
    const publicId = manifest[table]
    if (!publicId) return null
    const buf = await fetchBackupJson(publicId)
    if (!buf) return null
    try { return JSON.parse(buf.toString('utf8')) as unknown[] } catch { return null }
  }

  const payload = await loadBackupPayload(storagePublicId)
  return payload ? ((payload[table] as unknown[]) ?? null) : null
}

export async function registerBackupRecord(params: {
  filename: string
  sizeBytes: number
  tables: string[]
  storagePublicId?: string
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED'
  errorDetail?: string
  createdById?: string
  note?: string
}) {
  return prisma.backupRecord.create({
    data: {
      filename:        params.filename,
      sizeBytes:       params.sizeBytes,
      tables:          params.tables.join(','),
      status:          params.status,
      storagePublicId: params.storagePublicId,
      errorDetail:     params.errorDetail,
      createdById:     params.createdById,
      note:            params.note,
    },
  })
}

export function buildBackupFilename(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`
  return `backup_${ts}.json`
}

/** Derives a real status from per-table error counts — never hardcode COMPLETED. */
export function deriveBackupStatus(errors: Record<string, string>, totalTables: number): 'COMPLETED' | 'PARTIAL' | 'FAILED' {
  const failedCount = Object.keys(errors).length
  if (failedCount === 0) return 'COMPLETED'
  if (failedCount === totalTables) return 'FAILED'
  return 'PARTIAL'
}

async function notifyBackupFailure(filename: string, reason: string) {
  const recipients = await prisma.user.findMany({
    where: { role: { in: ['CEO', 'SUPER_ADMIN'] }, status: 'ACTIVE' },
    select: { id: true },
  })
  for (const user of recipients) {
    void createNotification({
      userId:  user.id,
      type:    'SYSTEM',
      title:   '🔴 Backup ล้มเหลว',
      message: `${filename} — ${reason}`,
      link:    '/security',
    })
  }
}

/**
 * Full backup flow shared by the manual (POST /api/backup) and cron
 * (cron/backup-daily) trigger points — both had the exact same gap: if
 * upload to Cloudinary threw (e.g. the payload exceeded the old 50MB
 * single-file cap), the throw used to propagate past both call sites'
 * outer try/catch before a BackupRecord or security event ever got
 * created, so a backup could fail with zero trace anywhere in the app.
 *
 * Storage is now split per-table (storeBackupTables) rather than one
 * combined file, so a single fast-growing table can no longer drag the
 * whole backup over the cap — each table has its own 50MB budget. Upload
 * failure (whether the whole run via requireCloudinary(), or an individual
 * table) still produces a BackupRecord (status FAILED/PARTIAL, with only
 * the tables that succeeded present in the manifest) and notifies
 * CEO/SUPER_ADMIN — the only roles that can see the backup panel at all.
 */
export async function runBackup(params: { createdById?: string; note?: string; ip?: string; userAgent?: string }) {
  const { data, errors: fetchErrors } = await createBackupData(BACKUP_TABLE_NAMES)
  const filename = buildBackupFilename()

  // Only attempt to upload tables that were actually fetched — a table that
  // failed at the DB-read stage has nothing to store.
  const fetchableData: BackupData = {}
  for (const [table, rows] of Object.entries(data)) {
    if (!(table in fetchErrors)) fetchableData[table] = rows
  }

  let manifest: BackupManifest = {}
  let uploadErrors: Record<string, string> = {}
  let sizeBytes = 0
  try {
    const stored = await storeBackupTables(fetchableData, filename)
    manifest      = stored.manifest
    uploadErrors  = stored.uploadErrors
    sizeBytes     = stored.sizeBytes
  } catch (err) {
    // requireCloudinary() itself threw before any table was attempted — every
    // fetched table counts as failed with the same underlying reason.
    const reason = err instanceof Error ? err.message : String(err)
    console.error('[backup] upload failed:', reason)
    for (const table of Object.keys(fetchableData)) uploadErrors[table] = reason
  }

  const combinedErrors = { ...fetchErrors, ...uploadErrors }
  const status = deriveBackupStatus(combinedErrors, BACKUP_TABLE_NAMES.length)
  const storagePublicId = Object.keys(manifest).length ? JSON.stringify(manifest) : undefined

  const record = await registerBackupRecord({
    filename,
    sizeBytes,
    tables:          BACKUP_TABLE_NAMES,
    storagePublicId,
    status,
    errorDetail:     Object.keys(combinedErrors).length ? JSON.stringify(combinedErrors) : undefined,
    createdById:     params.createdById,
    note:            params.note,
  })

  const failedCount = Object.keys(combinedErrors).length
  await logSecurityEvent({
    userId:      params.createdById,
    eventType:   status === 'FAILED' ? 'BACKUP_FAILED' : 'BACKUP_CREATED',
    severity:    status === 'FAILED' ? 'CRITICAL' : status === 'COMPLETED' ? 'INFO' : 'WARNING',
    description: `Backup ${status === 'FAILED' ? 'FAILED' : 'created'}: ${filename} (${status}${status !== 'COMPLETED' ? `, ${failedCount} table(s) failed` : ''})`,
    ip:        params.ip,
    userAgent: params.userAgent,
  })

  if (status === 'FAILED') {
    const [firstReason] = Object.values(combinedErrors)
    await notifyBackupFailure(filename, failedCount > 1 ? `${failedCount} ตารางล้มเหลว: ${firstReason}` : (firstReason ?? 'ไม่ทราบสาเหตุ'))
  }

  return { record, filename, sizeBytes, status, errors: combinedErrors }
}
