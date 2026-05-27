/**
 * Apply warnings schema columns on Turso (production).
 * Run: node scripts/migrate-turso-warnings.mjs
 */
import { createClient } from '@libsql/client'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = resolve(root, name)
    if (!existsSync(p)) continue
    const text = readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const m = trimmed.match(/^([A-Z_]+)=(.*)$/)
      if (!m) continue
      const key = m[1]
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  }
}

loadEnv()

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
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
