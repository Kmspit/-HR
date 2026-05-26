/**
 * เพิ่มคอลัมน์/ตารางใหม่บน Turso โดยไม่ลบข้อมูลเดิม
 * รัน: node scripts/migrate-turso-additive.mjs
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@libsql/client'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
if (!url || !token) {
  console.error('ต้องมี TURSO_DATABASE_URL และ TURSO_AUTH_TOKEN ใน .env')
  process.exit(1)
}

const db = createClient({ url, authToken: token })

const alters = [
  `ALTER TABLE company_settings ADD COLUMN officeAddress TEXT`,
  `ALTER TABLE attendances ADD COLUMN workPlaceName TEXT`,
  `ALTER TABLE attendances ADD COLUMN checkOutPhotoUrl TEXT`,
  `ALTER TABLE attendances ADD COLUMN earlyLeaveMinutes INTEGER NOT NULL DEFAULT 0`,
]

const creates = [
  `CREATE TABLE IF NOT EXISTS saved_work_places (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT saved_work_places_userId_fkey FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS saved_work_places_userId_name_key ON saved_work_places(userId, name)`,
  `CREATE TABLE IF NOT EXISTS user_devices (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT NOT NULL,
    deviceKey TEXT NOT NULL,
    deviceLabel TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    registeredAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lastSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resetRequestedAt DATETIME,
    CONSTRAINT user_devices_userId_fkey FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS user_devices_userId_key ON user_devices(userId)`,
]

async function run(sql) {
  try {
    await db.execute(sql)
    console.log('OK:', sql.slice(0, 60) + '...')
    return true
  } catch (e) {
    const msg = String(e.message ?? e)
    if (msg.includes('duplicate column') || msg.includes('already exists')) {
      console.log('skip (มีแล้ว):', sql.slice(0, 50))
      return true
    }
    console.error('FAIL:', msg, '\n ', sql.slice(0, 80))
    return false
  }
}

console.log('Migrating Turso:', url)
for (const s of alters) await run(s)
for (const s of creates) await run(s)
console.log('Done.')
