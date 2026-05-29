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

console.log('Done.')
