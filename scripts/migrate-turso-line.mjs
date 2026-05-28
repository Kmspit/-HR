/**
 * Safe migration: LINE fields on users
 * Run: npm run db:migrate:line
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
