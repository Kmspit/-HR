/**
 * ตาราง attendance_face_scans + faceScanId บน LINE notify log
 * รัน: npm run db:migrate:attendance-face-scans
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

const sql = [
  `CREATE TABLE IF NOT EXISTS attendance_face_scans (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT NOT NULL,
    attendanceId TEXT,
    faceLogId TEXT,
    scanType TEXT NOT NULL,
    scanTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confidenceScore REAL,
    matchScore REAL,
    livenessScore REAL,
    matched INTEGER NOT NULL DEFAULT 1,
    imageMime TEXT NOT NULL DEFAULT 'image/jpeg',
    imageData TEXT NOT NULL,
    locationName TEXT,
    address TEXT,
    lat REAL,
    lng REAL,
    deviceInfo TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS attendance_face_scans_user_time_idx ON attendance_face_scans (userId, scanTime)`,
  `CREATE INDEX IF NOT EXISTS attendance_face_scans_type_time_idx ON attendance_face_scans (scanType, scanTime)`,
  `CREATE INDEX IF NOT EXISTS attendance_face_scans_attendance_idx ON attendance_face_scans (attendanceId)`,
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

try {
  const has = await columnExists('attendance_line_notify_logs', 'faceScanId')
  if (!has) {
    await db.execute(`ALTER TABLE attendance_line_notify_logs ADD COLUMN faceScanId TEXT`)
    console.log('OK: ADD faceScanId')
  } else {
    console.log('skip: faceScanId column exists')
  }
} catch (e) {
  console.error('faceScanId:', String(e.message ?? e))
}

console.log('Done.')
