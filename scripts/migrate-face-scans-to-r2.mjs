/**
 * ย้ายรูปจาก Turso (base64) → Cloudflare R2 แล้วเคลียร์ imageData
 * รัน: npm run db:migrate:face-scans-to-r2
 * ต้องมี R2_* env ใน .env.local
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@libsql/client'
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
const accountId = process.env.R2_ACCOUNT_ID?.trim()
const accessKey = process.env.R2_ACCESS_KEY_ID?.trim()
const secretKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
const bucket = process.env.R2_BUCKET_NAME?.trim()
const prefix = (process.env.R2_PREFIX ?? 'face-scans/').replace(/\/?$/, '/')

if (!url || !token) {
  console.error('ต้องมี TURSO_DATABASE_URL และ TURSO_AUTH_TOKEN')
  process.exit(1)
}
if (!accountId || !accessKey || !secretKey || !bucket) {
  console.error('ต้องมี R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME')
  process.exit(1)
}

const db = createClient({ url, authToken: token })
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
})

const BATCH = 50
let migrated = 0
let skipped = 0
let failed = 0

function buildKey(row) {
  const d = new Date(row.scanTime)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const ext = (row.imageMime || 'image/jpeg').includes('png') ? 'png' : 'jpg'
  return `${prefix}${yyyy}/${mm}/${row.userId}/${row.scanType}_${row.id}.${ext}`
}

async function run() {
  let offset = 0
  for (;;) {
    const r = await db.execute({
      sql: `SELECT id, userId, scanType, scanTime, imageMime, imageData, objectKey, storageProvider
            FROM attendance_face_scans
            WHERE imageData IS NOT NULL AND length(imageData) > 100
              AND (objectKey IS NULL OR objectKey = '')
            ORDER BY scanTime ASC
            LIMIT ? OFFSET ?`,
      args: [BATCH, offset],
    })

    const rows = r.rows
    if (!rows.length) break

    for (const row of rows) {
      const id = row.id
      const imageData = row.imageData
      if (!imageData || row.objectKey) {
        skipped++
        continue
      }
      const key = buildKey(row)
      const buffer = Buffer.from(String(imageData), 'base64')
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: row.imageMime || 'image/jpeg',
            CacheControl: 'private, no-store',
          }),
        )
        await db.execute({
          sql: `UPDATE attendance_face_scans
                SET objectKey = ?, storageProvider = 'r2', imageData = ''
                WHERE id = ?`,
          args: [key, id],
        })
        migrated++
        console.log('OK', id, key)
      } catch (e) {
        failed++
        console.error('FAIL', id, String(e.message ?? e))
      }
    }

    if (rows.length < BATCH) break
    offset += BATCH
  }

  console.log(`Done. migrated=${migrated} skipped=${skipped} failed=${failed}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
