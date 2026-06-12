/**
 * JSON backup system — Phase 15
 * Exports key tables as JSON. No raw SQLite dump (serverless-safe).
 */
import { prisma } from '@/lib/prisma'

export type BackupTableName =
  | 'users'
  | 'leaveRequests'
  | 'leaveBalances'
  | 'taskAssignments'
  | 'expenseClaims'
  | 'payrolls'
  | 'warnings'
  | 'auditLogs'
  | 'securityEvents'

const BACKUP_TABLES: BackupTableName[] = [
  'users',
  'leaveRequests',
  'leaveBalances',
  'taskAssignments',
  'expenseClaims',
  'payrolls',
  'warnings',
  'auditLogs',
  'securityEvents',
]

type BackupData = Record<string, unknown[]>

export async function createBackupData(tables: BackupTableName[] = BACKUP_TABLES): Promise<BackupData> {
  const data: BackupData = {}

  for (const table of tables) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await (prisma as any)[table].findMany()
      data[table] = rows
    } catch {
      data[table] = []
    }
  }

  return data
}

export async function registerBackupRecord(params: {
  filename: string
  sizeBytes: number
  tables: BackupTableName[]
  createdById?: string
  note?: string
}) {
  return prisma.backupRecord.create({
    data: {
      filename:    params.filename,
      sizeBytes:   params.sizeBytes,
      tables:      params.tables.join(','),
      status:      'COMPLETED',
      createdById: params.createdById,
      note:        params.note,
    },
  })
}

export function buildBackupFilename(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`
  return `backup_${ts}.json`
}
