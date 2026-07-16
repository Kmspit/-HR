import { prisma } from '@/lib/prisma'
import * as Sentry from '@sentry/nextjs'

export function pragmaColumnNames(rows: unknown[]): string[] {
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

export async function addColumnIfMissing(table: string, column: string, ddl: string): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<unknown[]>(`PRAGMA table_info(${table})`)
  const existing = pragmaColumnNames(rows)
  if (existing.includes(column)) {
    console.log(`[MIGRATION] "${column}" in "${table}" already exists, skipping`)
    return
  }
  try {
    await prisma.$executeRawUnsafe(ddl)
    console.log(`[MIGRATION] Added column "${column}" to "${table}"`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('duplicate column') || msg.includes('no such table')) {
      console.warn(`[MIGRATION] Could not add "${column}" to "${table}": ${msg}`)
      return
    }
    throw err
  }
}

export async function runMigration(version: number, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    const result = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) AS cnt FROM schema_migrations WHERE version = ${version}
    `
    if (Number(result[0]?.cnt ?? 0) > 0) return
    await fn()
    const id = `mig_${version}`
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO schema_migrations (id, version, name) VALUES (${id}, ${version}, ${name})
    `
    console.log('[MIGRATION APPLIED]', version, name)
  } catch (err) {
    // Deliberately non-fatal (see ensureDbSchema's own catch) — but this used to be a
    // silent console.error only, which is how gaps like the missing training/knowledge/
    // sop/approval_requests tables went unnoticed for weeks. Sentry.captureException
    // still lets runEnsure() continue past this migration, but now someone actually
    // gets paged instead of the failure just scrolling off a cron log.
    console.error('[MIGRATION FAILED]', version, name, err instanceof Error ? err.message : String(err))
    Sentry.captureException(err, { tags: { migration_version: version, migration_name: name } })
  }
}

export async function validateCriticalSchema(): Promise<void> {
  try {
    const rows = await prisma.$queryRawUnsafe<unknown[]>('PRAGMA table_info(users)')
    const cols = pragmaColumnNames(rows)
    const critical = ['id', 'email', 'passwordHash', 'name', 'role', 'status', 'branchId', 'locked_until', 'password_changed_at', 'isCoworker']
    const missing = critical.filter(c => !cols.includes(c))
    if (missing.length > 0) {
      console.error('[SCHEMA VALIDATION] WARNING — missing user columns:', missing.join(', '))
      console.error('[SCHEMA VALIDATION] Auth may be degraded. Run ensure-db-schema again.')
      Sentry.captureMessage(`[SCHEMA VALIDATION] missing user columns: ${missing.join(', ')}`, 'error')
    } else {
      console.log('[SCHEMA VALIDATION] users table OK — all critical columns present')
    }
  } catch (err) {
    console.error('[SCHEMA VALIDATION] could not read user columns:', err instanceof Error ? err.message : err)
    Sentry.captureException(err)
  }
}

/**
 * Checks that every table schema.prisma declares (via @@map) actually exists in the
 * DB. This is the safety net for the exact failure mode that let training_modules,
 * knowledge_articles, sop_documents, sop_versions, training_enrollments, quiz_questions,
 * quiz_attempts, task_automation_rules, approval_requests, and approval_request_steps
 * go live in schema.prisma + their API routes without ever getting a CREATE TABLE here —
 * so every request against them 500'd, silently, for weeks. ensure-db-schema.ts has no
 * automated way to derive "every table schema.prisma expects" (no schema.prisma parsing
 * at runtime), so `expectedTables` below is a hand-maintained mirror of every @@map(...)
 * in schema.prisma — keep it in sync when adding a new model + CREATE TABLE pair.
 * Non-fatal by design (matches validateCriticalSchema) — an incomplete DB shouldn't take
 * down every other page, but the gap must not go unreported again.
 */
export async function validateAllTablesExist(expectedTables: string[]): Promise<string[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type = 'table'`,
    )
    const existing = new Set(rows.map((r) => r.name))
    const missing = expectedTables.filter((t) => !existing.has(t))
    if (missing.length > 0) {
      console.error('[SCHEMA VALIDATION] WARNING — tables missing from DB:', missing.join(', '))
      console.error('[SCHEMA VALIDATION] Any route querying these will 500. Add CREATE TABLE to ensure-db-schema.ts and bump CURRENT_SCHEMA_VERSION.')
      Sentry.captureMessage(`[SCHEMA VALIDATION] missing tables: ${missing.join(', ')}`, 'error')
    } else {
      console.log(`[SCHEMA VALIDATION] all ${expectedTables.length} expected tables present`)
    }
    return missing
  } catch (err) {
    console.error('[SCHEMA VALIDATION] could not list tables:', err instanceof Error ? err.message : err)
    Sentry.captureException(err)
    return []
  }
}
