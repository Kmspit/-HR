/**
 * ย้ายรูปเดิมจาก DB (base64) → Cloudinary โดยไม่ลบแถว attendance
 * รัน: npm run db:migrate:all-images-cloudinary
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@libsql/client'
import { v2 as cloudinary } from 'cloudinary'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()
const ROOT = (process.env.CLOUDINARY_ROOT_FOLDER ?? 'hr-system').replace(/^\/|\/$/g, '')

if (!url || !token || !cloudName || !apiKey || !apiSecret) {
  console.error('ต้องมี TURSO + CLOUDINARY env')
  process.exit(1)
}

cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })
const db = createClient({ url, authToken: token })

async function uploadB64(buffer, folder, publicId, mime) {
  const dataUri = `data:${mime};base64,${buffer.toString('base64')}`
  return cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: publicId,
    type: 'authenticated',
    resource_type: 'image',
    overwrite: true,
  })
}

async function migrateFaceScans() {
  let offset = 0
  let ok = 0
  let fail = 0
  for (;;) {
    const r = await db.execute({
      sql: `SELECT id, userId, employeeId, scanType, scanTime, imageMime, imageData, cloudinaryPublicId
            FROM attendance_face_scans
            WHERE length(COALESCE(imageData,'')) > 100
              AND (cloudinaryPublicId IS NULL OR cloudinaryPublicId = '')
            LIMIT 25 OFFSET ?`,
      args: [offset],
    })
    if (!r.rows.length) break
    for (const row of r.rows) {
      const emp = row.employeeId || `uid_${row.userId}`
      const d = new Date(row.scanTime)
      const folder = `${ROOT}/attendance/${emp}/${row.scanType === 'lunch-out' ? 'lunch-start' : row.scanType === 'lunch-in' ? 'lunch-end' : row.scanType}`
      try {
        const up = await uploadB64(
          Buffer.from(String(row.imageData), 'base64'),
          folder,
          `${row.scanType}_${row.id}`,
          row.imageMime || 'image/jpeg',
        )
        await db.execute({
          sql: `UPDATE attendance_face_scans SET
                cloudinaryPublicId=?, objectKey=?, imageUrl=?, secureUrl=?,
                format=?, fileSize=?, width=?, height=?,
                storageProvider='cloudinary', imageData='', faceMatched=COALESCE(faceMatched, matched)
                WHERE id=?`,
          args: [up.public_id, up.public_id, up.url, up.secure_url, up.format, up.bytes, up.width, up.height, row.id],
        })
        ok++
        console.log('scan OK', row.id)
      } catch (e) {
        fail++
        console.error('scan FAIL', row.id, e.message)
      }
    }
    if (r.rows.length < 25) break
    offset += 25
  }
  console.log(`face_scans migrated=${ok} failed=${fail}`)
}

async function migrateProfileAvatars() {
  const r = await db.execute({
    sql: `SELECT id, employeeId, profileImageBase64, profileCloudinaryPublicId
          FROM users WHERE length(COALESCE(profileImageBase64,'')) > 100
            AND (profileCloudinaryPublicId IS NULL OR profileCloudinaryPublicId = '')`,
  })
  let ok = 0
  for (const row of r.rows) {
    const emp = row.employeeId || `uid_${row.id}`
    const folder = `${ROOT}/employees/${emp}/profile`
    try {
      const up = await uploadB64(Buffer.from(String(row.profileImageBase64), 'base64'), folder, 'avatar', 'image/jpeg')
      await db.execute({
        sql: `UPDATE users SET profileCloudinaryPublicId=?, profileSecureUrl=?, profileImage=?, profileImageBase64=NULL WHERE id=?`,
        args: [up.public_id, up.secure_url, up.public_id, row.id],
      })
      ok++
      console.log('avatar OK', row.id)
    } catch (e) {
      console.error('avatar FAIL', row.id, e.message)
    }
  }
  console.log(`avatars migrated=${ok}`)
}

async function main() {
  await migrateFaceScans()
  await migrateProfileAvatars()
  console.log('All done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
