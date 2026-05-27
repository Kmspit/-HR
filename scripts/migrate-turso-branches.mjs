/**
 * Safe migration: company_branches + users.branchId + default data
 * Run: node scripts/migrate-turso-branches.mjs
 */
import { createClient } from '@libsql/client'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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
      let val = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = val
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

const HQ_ID = 'branch-hq-kmsp'
const NMA_ID = 'branch-nma-korat'

async function tableExists(name) {
  const rs = await db.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`,
  )
  return rs.rows.length > 0
}

async function columns(table) {
  const rs = await db.execute(`PRAGMA table_info(${table})`)
  return rs.rows.map((r) => r.name)
}

async function main() {
  const hasBranches = await tableExists('company_branches')
  if (!hasBranches) {
    await db.execute(`
      CREATE TABLE company_branches (
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
    console.log('[ok] created company_branches')
  } else {
    console.log('[skip] company_branches exists')
  }

  const userCols = await columns('users')
  if (!userCols.includes('branchId')) {
    await db.execute(`ALTER TABLE users ADD COLUMN branchId TEXT`)
    console.log('[ok] users.branchId added')
  } else {
    console.log('[skip] users.branchId exists')
  }
  if (!userCols.includes('profileImageBase64')) {
    await db.execute(`ALTER TABLE users ADD COLUMN profileImageBase64 TEXT`)
    console.log('[ok] users.profileImageBase64 added')
  } else {
    console.log('[skip] users.profileImageBase64 exists')
  }

  await db.execute({
    sql: `INSERT OR IGNORE INTO company_branches (id, code, name, nameEn, address, isActive, isDefault, createdAt, updatedAt)
          VALUES (?, 'HQ', 'สำนักงานใหญ่', 'Head Office', 'กรุงเทพมหานคร', 1, 1, datetime('now'), datetime('now'))`,
    args: [HQ_ID],
  })
  await db.execute({
    sql: `INSERT OR IGNORE INTO company_branches (id, code, name, nameEn, address, isActive, isDefault, createdAt, updatedAt)
          VALUES (?, 'NMA', 'สาขานครราชสีมา', 'Nakhon Ratchasima Branch', 'จังหวัดนครราชสีมา', 1, 0, datetime('now'), datetime('now'))`,
    args: [NMA_ID],
  })
  console.log('[ok] default branches seeded')

  const backfill = await db.execute(
    `UPDATE users SET branchId = ? WHERE branchId IS NULL OR branchId = ''`,
    [HQ_ID],
  )
  console.log('[ok] users backfill to HQ:', backfill.rowsAffected ?? 0)

  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
