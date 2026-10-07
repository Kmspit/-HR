/**
 * Safe migration: divisions, departments, sections + users FK columns
 * Run: npm run db:migrate:org
 */
import { createClient } from '@libsql/client'
import { loadLocalEnv, requireProdTarget } from './lib/prod-guard.mjs'

loadLocalEnv()

const { url, authToken } = await requireProdTarget('migrate-turso-org.mjs')
if (!url || !authToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN')
  process.exit(1)
}

const db = createClient({ url, authToken })

async function columns(table) {
  const rs = await db.execute(`PRAGMA table_info(${table})`)
  return rs.rows.map((r) => r.name)
}

async function main() {
  await db.execute(`
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
  await db.execute(`
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
  await db.execute(`
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

  const userCols = await columns('users')
  for (const [col, ddl] of [
    ['divisionId', 'ALTER TABLE users ADD COLUMN divisionId TEXT'],
    ['departmentId', 'ALTER TABLE users ADD COLUMN departmentId TEXT'],
    ['sectionId', 'ALTER TABLE users ADD COLUMN sectionId TEXT'],
  ]) {
    if (!userCols.includes(col)) {
      await db.execute(ddl)
      console.log('[ok] users.' + col)
    }
  }

  console.log('Done. Existing users keep legacy department text; assign org via HR UI.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
