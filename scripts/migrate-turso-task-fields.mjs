/**
 * เพิ่ม 6 คอลัมน์ Phase 1 สำหรับ department workflow บน Turso
 * รัน: node scripts/migrate-turso-task-fields.mjs
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@libsql/client'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

const url   = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
if (!url || !token) {
  console.error('ต้องมี TURSO_DATABASE_URL และ TURSO_AUTH_TOKEN ใน .env.local')
  process.exit(1)
}

const db = createClient({ url, authToken: token })

const alters = [
  `ALTER TABLE task_assignments ADD COLUMN case_number TEXT`,
  `ALTER TABLE task_assignments ADD COLUMN client_name TEXT`,
  `ALTER TABLE task_assignments ADD COLUMN task_department TEXT`,
  `ALTER TABLE task_assignments ADD COLUMN appointment_date DATETIME`,
  `ALTER TABLE task_assignments ADD COLUMN court_date DATETIME`,
  `ALTER TABLE task_assignments ADD COLUMN appointment_place TEXT`,
]

async function run(sql) {
  try {
    await db.execute(sql)
    console.log('OK:', sql.slice(0, 70))
    return true
  } catch (e) {
    const msg = String(e.message ?? e)
    if (msg.includes('duplicate column') || msg.includes('already exists')) {
      console.log('skip (มีแล้ว):', sql.slice(0, 60))
      return true
    }
    console.error('FAIL:', msg, '\n  ', sql)
    return false
  }
}

console.log('Migrating Turso:', url)
for (const s of alters) await run(s)
console.log('Done.')
