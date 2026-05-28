/**
 * ตารางรหัสเชื่อม LINE OA
 * Run: npm run db:migrate:line-webhook
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@libsql/client'

config({ path: resolve(process.cwd(), '.env') })

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
if (!url || !authToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN')
  process.exit(1)
}

const db = createClient({ url, authToken })

await db.execute(`
  CREATE TABLE IF NOT EXISTS line_link_codes (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    expiresAt DATETIME NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)
await db.execute(`
  CREATE INDEX IF NOT EXISTS line_link_codes_user_idx ON line_link_codes (userId)
`)

console.log('[ok] line_link_codes ready')
