/**
 * Apply warnings schema columns on Turso (production).
 * Run: node scripts/migrate-turso-warnings.mjs
 */
import { createClient } from '@libsql/client'
import { loadLocalEnv, requireProdTarget } from './lib/prod-guard.mjs'

loadLocalEnv()

const { url, authToken } = await requireProdTarget('migrate-turso-warnings.mjs')
if (!url || !authToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN')
  process.exit(1)
}

const db = createClient({ url, authToken })

async function columns(table) {
  const rs = await db.execute(`PRAGMA table_info(${table})`)
  return rs.rows.map((r) => r.name)
}

async function addColumnIfMissing(table, col, ddl) {
  const cols = await columns(table)
  if (cols.includes(col)) {
    console.log(`[skip] ${table}.${col} exists`)
    return
  }
  await db.execute(ddl)
  console.log(`[ok] ${table}.${col} added`)
}

async function main() {
  const warnCols = await columns('warnings')
  console.log('warnings columns:', warnCols.join(', ') || '(none)')

  await addColumnIfMissing(
    'warnings',
    'issuedById',
    'ALTER TABLE warnings ADD COLUMN issuedById TEXT'
  )
  await addColumnIfMissing(
    'warnings',
    'pdfBase64',
    'ALTER TABLE warnings ADD COLUMN pdfBase64 TEXT'
  )
  await addColumnIfMissing('warnings', 'month', 'ALTER TABLE warnings ADD COLUMN month INTEGER')
  await addColumnIfMissing('warnings', 'year', 'ALTER TABLE warnings ADD COLUMN year INTEGER')

  const userCols = await columns('users')
  console.log('users columns:', userCols.join(', ') || '(none)')
  await addColumnIfMissing(
    'users',
    'profileImageBase64',
    'ALTER TABLE users ADD COLUMN profileImageBase64 TEXT',
  )

  // Backfill issuedById for legacy rows (use recipient as fallback)
  const backfill = await db.execute(`
    UPDATE warnings
    SET issuedById = userId
    WHERE issuedById IS NULL OR issuedById = ''
  `)
  console.log('[ok] backfill issuedById rows:', backfill.rowsAffected ?? 0)

  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
