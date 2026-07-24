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
import { uploadBackupJson, fetchBackupJson, backupFolder } from '@/lib/cloudinary-service'

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
  { table: 'task_templates',     accessor: 'taskTemplate' },
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
  { table: 'case_templates',           accessor: 'caseTemplate' },
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

  // ── SOP / training / automation (config, currently near-empty) ──────────────
  { table: 'sop_documents',            accessor: 'sopDocument' },
  { table: 'sop_versions',             accessor: 'sopVersion' },
  { table: 'training_modules',         accessor: 'trainingModule' },
  { table: 'training_enrollments',     accessor: 'trainingEnrollment' },
  { table: 'quiz_questions',           accessor: 'quizQuestion' },
  { table: 'quiz_attempts',            accessor: 'quizAttempt' },
  { table: 'automation_rules',         accessor: 'automationRule' },
  { table: 'task_automation_rules',    accessor: 'taskAutomationRule' },
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

/** Uploads the backup payload to Cloudinary and returns a durable reference — the
 *  payload is never recomputed for download/restore, only fetched back verbatim. */
export async function storeBackupPayload(
  data: BackupData,
  filename: string,
): Promise<{ publicId: string; sizeBytes: number }> {
  const json = JSON.stringify(data)
  const bytes = Buffer.byteLength(json, 'utf8')
  const { publicId } = await uploadBackupJson(Buffer.from(json, 'utf8'), {
    folder: backupFolder(),
    filename,
  })
  return { publicId, sizeBytes: bytes }
}

export async function loadBackupPayload(publicId: string): Promise<BackupData | null> {
  const buf = await fetchBackupJson(publicId)
  if (!buf) return null
  try {
    return JSON.parse(buf.toString('utf8')) as BackupData
  } catch {
    return null
  }
}

export async function registerBackupRecord(params: {
  filename: string
  sizeBytes: number
  tables: string[]
  storagePublicId: string
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
