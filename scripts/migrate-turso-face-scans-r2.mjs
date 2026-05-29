/**
 * คอลัมน์ R2 สำหรับ attendance_face_scans
 * รัน: npm run db:migrate:face-scans-r2
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@libsql/client'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
if (!url || !token) {
  console.error('ต้องมี TURSO_DATABASE_URL และ TURSO_AUTH_TOKEN')
  process.exit(1)
}

const db = createClient({ url, authToken: token })

async function columnExists(table, column) {
  const r = await db.execute(`PRAGMA table_info(${table})`)
  return r.rows.some((row) => row.name === column || row[1] === column)
}

const alters = [
  ['storageProvider', `ALTER TABLE attendance_face_scans ADD COLUMN storageProvider TEXT NOT NULL DEFAULT 'db'`],
  ['objectKey', `ALTER TABLE attendance_face_scans ADD COLUMN objectKey TEXT`],
]

for (const [col, sql] of alters) {
  try {
    const has = await columnExists('attendance_face_scans', col)
    if (has) {
      console.log('skip:', col)
      continue
    }
    await db.execute(sql)
    console.log('OK:', col)
  } catch (e) {
    console.error('FAIL', col, String(e.message ?? e))
  }
}

console.log('Done.')
