/**
 * คอลัมน์สถานะส่ง LINE ใบเตือน
 * Run: npm run db:migrate:warning-line
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

async function columns(table) {
  const r = await db.execute(`PRAGMA table_info(${table})`)
  return r.rows.map((row) => String(row.name))
}

const cols = await columns('warnings')
const add = async (name, ddl) => {
  if (cols.includes(name)) {
    console.log('[skip]', name)
    return
  }
  await db.execute(ddl)
  console.log('[ok]', name)
}

await add('lineDeliveryStatus', `ALTER TABLE warnings ADD COLUMN lineDeliveryStatus TEXT`)
await add('lineSentAt', `ALTER TABLE warnings ADD COLUMN lineSentAt DATETIME`)
await add('lineUserId', `ALTER TABLE warnings ADD COLUMN lineUserId TEXT`)
await add('lineErrorMessage', `ALTER TABLE warnings ADD COLUMN lineErrorMessage TEXT`)

console.log('Done.')
