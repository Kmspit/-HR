/**
 * Safe migration: LINE fields on users
 * Run: npm run db:migrate:line
 */
import { createClient } from '@libsql/client'
import { loadLocalEnv, requireProdTarget } from './lib/prod-guard.mjs'

loadLocalEnv()

const { url, authToken } = await requireProdTarget('migrate-turso-line.mjs')
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
  const userCols = await columns('users')
  for (const [col, ddl] of [
    ['lineUserId', 'ALTER TABLE users ADD COLUMN lineUserId TEXT'],
    ['lineDisplayName', 'ALTER TABLE users ADD COLUMN lineDisplayName TEXT'],
  ]) {
    if (!userCols.includes(col)) {
      await db.execute(ddl)
      console.log('[ok] users.' + col)
    }
  }
  console.log('Done. Existing lineId preserved; lineUserId/lineDisplayName optional.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
