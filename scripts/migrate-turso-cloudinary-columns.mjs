/**
 * คอลัมน์ Cloudinary (additive) — ไม่ลบข้อมูล attendance
 * รัน: npm run db:migrate:cloudinary-columns
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

async function add(table, column, ddl) {
  if (await columnExists(table, column)) {
    console.log('skip:', `${table}.${column}`)
    return
  }
  await db.execute(ddl)
  console.log('OK:', `${table}.${column}`)
}

const alters = [
  ['users', 'profileCloudinaryPublicId', `ALTER TABLE users ADD COLUMN profileCloudinaryPublicId TEXT`],
  ['users', 'profileSecureUrl', `ALTER TABLE users ADD COLUMN profileSecureUrl TEXT`],
  ['user_face_profiles', 'employeeId', `ALTER TABLE user_face_profiles ADD COLUMN employeeId TEXT`],
  ['user_face_profiles', 'faceEmbedding', `ALTER TABLE user_face_profiles ADD COLUMN faceEmbedding TEXT`],
  ['user_face_profiles', 'cloudinaryPublicId', `ALTER TABLE user_face_profiles ADD COLUMN cloudinaryPublicId TEXT`],
  ['user_face_profiles', 'faceImageUrl', `ALTER TABLE user_face_profiles ADD COLUMN faceImageUrl TEXT`],
  ['user_face_profiles', 'secureUrl', `ALTER TABLE user_face_profiles ADD COLUMN secureUrl TEXT`],
  ['user_face_profiles', 'isActive', `ALTER TABLE user_face_profiles ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1`],
  ['attendance_face_scans', 'employeeId', `ALTER TABLE attendance_face_scans ADD COLUMN employeeId TEXT`],
  ['attendance_face_scans', 'companyId', `ALTER TABLE attendance_face_scans ADD COLUMN companyId TEXT`],
  ['attendance_face_scans', 'branchId', `ALTER TABLE attendance_face_scans ADD COLUMN branchId TEXT`],
  ['attendance_face_scans', 'cloudinaryPublicId', `ALTER TABLE attendance_face_scans ADD COLUMN cloudinaryPublicId TEXT`],
  ['attendance_face_scans', 'imageUrl', `ALTER TABLE attendance_face_scans ADD COLUMN imageUrl TEXT`],
  ['attendance_face_scans', 'secureUrl', `ALTER TABLE attendance_face_scans ADD COLUMN secureUrl TEXT`],
  ['attendance_face_scans', 'format', `ALTER TABLE attendance_face_scans ADD COLUMN format TEXT`],
  ['attendance_face_scans', 'fileSize', `ALTER TABLE attendance_face_scans ADD COLUMN fileSize INTEGER`],
  ['attendance_face_scans', 'width', `ALTER TABLE attendance_face_scans ADD COLUMN width INTEGER`],
  ['attendance_face_scans', 'height', `ALTER TABLE attendance_face_scans ADD COLUMN height INTEGER`],
  ['attendance_face_scans', 'faceMatched', `ALTER TABLE attendance_face_scans ADD COLUMN faceMatched INTEGER NOT NULL DEFAULT 1`],
  ['attendance_face_scans', 'location', `ALTER TABLE attendance_face_scans ADD COLUMN location TEXT`],
  ['attendance_face_scans', 'latitude', `ALTER TABLE attendance_face_scans ADD COLUMN latitude REAL`],
  ['attendance_face_scans', 'longitude', `ALTER TABLE attendance_face_scans ADD COLUMN longitude REAL`],
  ['company_settings', 'imageRetentionDays', `ALTER TABLE company_settings ADD COLUMN imageRetentionDays INTEGER NOT NULL DEFAULT 90`],
]

for (const [table, col, ddl] of alters) {
  try {
    await add(table, col, ddl)
  } catch (e) {
    console.error('FAIL', table, col, String(e.message ?? e))
  }
}

console.log('Done.')
