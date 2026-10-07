/**
 * Face recognition tables on Turso.
 * Run: node scripts/migrate-turso-face.mjs
 */
import { createClient } from '@libsql/client'
import { loadLocalEnv, requireProdTarget } from './lib/prod-guard.mjs'

loadLocalEnv()

const { url, authToken } = await requireProdTarget('migrate-turso-face.mjs')
if (!url || !authToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN')
  process.exit(1)
}

const db = createClient({ url, authToken })

async function main() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_face_profiles (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL UNIQUE,
      encryptedDescriptor TEXT NOT NULL,
      modelVersion TEXT NOT NULL DEFAULT 'face-api-tiny-v1',
      sampleCount INTEGER NOT NULL DEFAULT 1,
      registeredAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS attendance_face_logs (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL,
      attendanceId TEXT,
      action TEXT NOT NULL,
      method TEXT NOT NULL,
      matched INTEGER NOT NULL DEFAULT 0,
      matchScore REAL,
      livenessScore REAL,
      spoofFlags TEXT,
      failureReason TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS attendance_face_logs_user_created_idx
    ON attendance_face_logs (userId, createdAt)
  `)
  console.log('[ok] face tables ready')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
