/**
 * ย้ายรูปจาก Turso (base64) → Cloudinary authenticated
 * รัน: npm run db:migrate:face-scans-to-cloudinary
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@libsql/client'
import { v2 as cloudinary } from 'cloudinary'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

if (!url || !token) {
  console.error('ต้องมี TURSO_DATABASE_URL และ TURSO_AUTH_TOKEN')
  process.exit(1)
}

const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()
const folderBase = (process.env.CLOUDINARY_FOLDER ?? 'hrflow/face-scans').replace(/\/$/, '')

if (!cloudName || !apiKey || !apiSecret) {
  console.error('ต้องมี CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET')
  process.exit(1)
}

cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })

const db = createClient({ url, authToken: token })
const BATCH = 30
let migrated = 0
let failed = 0

function folderFor(row) {
  const d = new Date(row.scanTime)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${folderBase}/${yyyy}/${mm}/${row.userId}`
}

async function run() {
  let offset = 0
  for (;;) {
    const r = await db.execute({
      sql: `SELECT id, userId, scanType, scanTime, imageMime, imageData, objectKey, storageProvider
            FROM attendance_face_scans
            WHERE imageData IS NOT NULL AND length(imageData) > 100
              AND (storageProvider IS NULL OR storageProvider IN ('db', 'dual', 'r2')
                   OR objectKey IS NULL OR objectKey = '')
            ORDER BY scanTime ASC
            LIMIT ? OFFSET ?`,
      args: [BATCH, offset],
    })

    const rows = r.rows
    if (!rows.length) break

    for (const row of rows) {
      const id = row.id
      const imageData = row.imageData
      if (!imageData) continue
      const folder = folderFor(row)
      const publicId = `${row.scanType}_${id}`
      const mime = row.imageMime || 'image/jpeg'
      const dataUri = `data:${mime};base64,${String(imageData)}`

      try {
        const result = await cloudinary.uploader.upload(dataUri, {
          folder,
          public_id: publicId,
          resource_type: 'image',
          type: 'authenticated',
          overwrite: true,
        })
        await db.execute({
          sql: `UPDATE attendance_face_scans
                SET objectKey = ?, storageProvider = 'cloudinary', imageData = ''
                WHERE id = ?`,
          args: [result.public_id, id],
        })
        migrated++
        console.log('OK', id, result.public_id)
      } catch (e) {
        failed++
        console.error('FAIL', id, String(e.message ?? e))
      }
    }

    if (rows.length < BATCH) break
    offset += BATCH
  }

  console.log(`Done. migrated=${migrated} failed=${failed}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
