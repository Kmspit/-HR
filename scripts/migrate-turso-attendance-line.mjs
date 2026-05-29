/**
 * ตาราง log การส่ง LINE แจ้ง HR เมื่อลงเวลา
 * รัน: npm run db:migrate:attendance-line
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

const sql = [
  `CREATE TABLE IF NOT EXISTS attendance_line_notify_logs (
    id TEXT NOT NULL PRIMARY KEY,
    employeeUserId TEXT NOT NULL,
    hrLineUserId TEXT NOT NULL,
    eventType TEXT NOT NULL,
    attendanceId TEXT,
    faceLogId TEXT,
    messageText TEXT NOT NULL,
    photoUrl TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    failedReason TEXT,
    retryCount INTEGER NOT NULL DEFAULT 0,
    sentAt DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS attendance_line_notify_status_idx ON attendance_line_notify_logs (status, createdAt)`,
  `CREATE INDEX IF NOT EXISTS attendance_line_notify_employee_idx ON attendance_line_notify_logs (employeeUserId, createdAt)`,
]

for (const s of sql) {
  try {
    await db.execute(s)
    console.log('OK:', s.slice(0, 60))
  } catch (e) {
    const msg = String(e.message ?? e)
    if (msg.includes('already exists')) console.log('skip:', s.slice(0, 50))
    else console.error('FAIL:', msg)
  }
}

async function columnExists(table, column) {
  const r = await db.execute(`PRAGMA table_info(${table})`)
  return r.rows.some((row) => row.name === column || row[1] === column)
}

const alters = [
  ['faceScanId', `ALTER TABLE attendance_line_notify_logs ADD COLUMN faceScanId TEXT`],
  ['employeeId', `ALTER TABLE attendance_line_notify_logs ADD COLUMN employeeId TEXT`],
  ['scanType', `ALTER TABLE attendance_line_notify_logs ADD COLUMN scanType TEXT`],
]

for (const [col, ddl] of alters) {
  try {
    if (await columnExists('attendance_line_notify_logs', col)) {
      console.log('skip column:', col)
      continue
    }
    await db.execute(ddl)
    console.log('OK column:', col)
  } catch (e) {
    console.error('FAIL', col, String(e.message ?? e))
  }
}

try {
  await db.execute(
    `CREATE INDEX IF NOT EXISTS attendance_line_notify_dedup_idx ON attendance_line_notify_logs (attendanceId, eventType, status)`,
  )
  console.log('OK: dedup index')
} catch (e) {
  console.error('FAIL index', String(e.message ?? e))
}

console.log('Done.')
