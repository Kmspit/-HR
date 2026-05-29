/**
 * เพิ่มคอลัมน์ Attendance Work Log บน Turso (additive)
 * รัน: npm run db:migrate:attendance-worklog
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

const alters = [
  `ALTER TABLE attendances ADD COLUMN dayOfWeek INTEGER`,
  `ALTER TABLE attendances ADD COLUMN workMinutes INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE attendances ADD COLUMN leaveType TEXT`,
  `ALTER TABLE attendances ADD COLUMN checkInLat REAL`,
  `ALTER TABLE attendances ADD COLUMN checkInLng REAL`,
  `ALTER TABLE attendances ADD COLUMN checkInAddress TEXT`,
  `ALTER TABLE attendances ADD COLUMN checkInWorkPlaceName TEXT`,
  `ALTER TABLE attendances ADD COLUMN checkOutLat REAL`,
  `ALTER TABLE attendances ADD COLUMN checkOutLng REAL`,
  `ALTER TABLE attendances ADD COLUMN checkOutAddress TEXT`,
  `ALTER TABLE attendances ADD COLUMN checkOutWorkPlaceName TEXT`,
]

async function run(sql) {
  try {
    await db.execute(sql)
    console.log('OK:', sql.slice(0, 70))
    return true
  } catch (e) {
    const msg = String(e.message ?? e)
    if (msg.includes('duplicate column') || msg.includes('already exists')) {
      console.log('skip:', sql.slice(0, 55))
      return true
    }
    console.error('FAIL:', msg, '\n ', sql)
    return false
  }
}

console.log('Migrating attendance work log:', url)
let ok = true
for (const s of alters) {
  if (!(await run(s))) ok = false
}

if (ok) {
  await db.execute(`
    UPDATE attendances
    SET checkInLat = lat, checkInLng = lng, checkInAddress = address, checkInWorkPlaceName = workPlaceName
    WHERE checkIn IS NOT NULL AND checkInLat IS NULL AND lat IS NOT NULL
  `).catch(() => {})
  console.log('Backfill check-in location (if any)')
}

console.log(ok ? 'Done.' : 'Completed with errors.')
process.exit(ok ? 0 : 1)
