import { prisma } from '@/lib/prisma'

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
    console.error('[MIGRATION FAILED]', version, name, err instanceof Error ? err.message : String(err))
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
    } else {
      console.log('[SCHEMA VALIDATION] users table OK — all critical columns present')
    }
  } catch (err) {
    console.error('[SCHEMA VALIDATION] could not read user columns:', err instanceof Error ? err.message : err)
  }
}
