/**
 * Safe migration: company_holidays table
 * Run: npm run db:migrate:holidays
 */
import { createClient } from '@libsql/client'
import { loadLocalEnv, requireProdTarget } from './lib/prod-guard.mjs'

loadLocalEnv()

const { url, authToken } = await requireProdTarget('migrate-turso-holidays.mjs')
if (!url || !authToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN')
  process.exit(1)
}

const db = createClient({ url, authToken })

async function tableExists(name) {
  const rs = await db.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`,
  )
  return rs.rows.length > 0
}

async function main() {
  if (!(await tableExists('company_holidays'))) {
    await db.execute(`
      CREATE TABLE company_holidays (
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
    console.log('[ok] created company_holidays')
  } else {
    console.log('[skip] company_holidays already exists')
  }
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
