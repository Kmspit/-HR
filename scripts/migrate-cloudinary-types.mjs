/**
 * scripts/migrate-cloudinary-types.mjs
 *
 * Audits CaseDocumentFiles in the DB for mismatched Cloudinary delivery type.
 * Files stored as  type:upload (public)  instead of  type:authenticated  can
 * be accessed without a signed URL — which is wrong for sensitive HR documents.
 *
 * Usage:
 *   node scripts/migrate-cloudinary-types.mjs              # dry-run (safe)
 *   node scripts/migrate-cloudinary-types.mjs --migrate    # re-upload as authenticated
 *   node scripts/migrate-cloudinary-types.mjs --table announcements  # different table
 *
 * Required env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN,
 *               CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */

import { createClient }   from '@libsql/client'
import { v2 as cloudinary } from 'cloudinary'
import { readFile }        from 'fs/promises'
import path                from 'path'
import { fileURLToPath }   from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Config ────────────────────────────────────────────────────────────────────

const MIGRATE   = process.argv.includes('--migrate')
const TABLE_ARG = (() => {
  const i = process.argv.indexOf('--table')
  return i !== -1 ? process.argv[i + 1] : null
})()

// Load .env.local if not running in CI
if (!process.env.TURSO_DATABASE_URL) {
  try {
    const envPath = path.resolve(__dirname, '../.env.local')
    const raw = await readFile(envPath, 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/)
      if (m) process.env[m[1]] = m[2]
    }
  } catch { /* no .env.local — use process.env from shell */ }
}

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env
const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env

if (!TURSO_DATABASE_URL) {
  console.error('❌  TURSO_DATABASE_URL is not set')
  process.exit(1)
}
if (MIGRATE && (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET)) {
  console.error('❌  Cloudinary credentials are required for --migrate mode')
  process.exit(1)
}

// ── Clients ───────────────────────────────────────────────────────────────────

const db = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN })

if (MIGRATE) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key:    CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  })
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Tables / columns to audit. Each entry defines where to find
 * a public_id + secure_url pair that should be type:authenticated.
 */
const AUDIT_TARGETS = [
  {
    label:       'case_document_files',
    table:       'case_document_files',
    idCol:       'id',
    publicIdCol: 'public_id',
    urlCol:      'secure_url',
    nameCol:     'file_name',
  },
  {
    label:       'attendance_face_scans',
    table:       'attendance_face_scans',
    idCol:       'id',
    publicIdCol: 'cloudinaryPublicId',
    urlCol:      'secureUrl',
    nameCol:     'scanType',
  },
  {
    label:       'user_face_profiles',
    table:       'user_face_profiles',
    idCol:       'id',
    publicIdCol: 'cloudinaryPublicId',
    urlCol:      'secureUrl',
    nameCol:     'userId',
  },
]

const targets = TABLE_ARG
  ? AUDIT_TARGETS.filter(t => t.table === TABLE_ARG)
  : AUDIT_TARGETS

// ── Main ──────────────────────────────────────────────────────────────────────

async function auditTable(target) {
  const { label, table, idCol, publicIdCol, urlCol, nameCol } = target

  let rows
  try {
    const result = await db.execute(`
      SELECT ${idCol}, ${publicIdCol}, ${urlCol}, ${nameCol}
      FROM   ${table}
      WHERE  ${publicIdCol} IS NOT NULL
        AND  ${urlCol}      LIKE '%/upload/%'
    `)
    rows = result.rows
  } catch (err) {
    console.warn(`⚠️  Could not query ${table}: ${err.message}`)
    return { table: label, checked: 0, public: 0, migrated: 0, errors: 0 }
  }

  if (rows.length === 0) {
    console.log(`✅  [${label}] All files use authenticated delivery — nothing to migrate`)
    return { table: label, checked: 0, public: 0, migrated: 0, errors: 0 }
  }

  console.log(`\n📋  [${label}] Found ${rows.length} file(s) with public delivery URL:\n`)

  let migrated = 0
  let errors   = 0

  for (const row of rows) {
    const rowId   = row[0]
    const pubId   = row[1]
    const url     = row[2]
    const name    = row[3]

    console.log(`   id: ${rowId}`)
    console.log(`   public_id: ${pubId}`)
    console.log(`   name: ${name}`)
    console.log(`   url: ${url}`)

    if (!MIGRATE) {
      console.log('   → dry-run: would re-upload as type:authenticated\n')
      continue
    }

    // Re-upload strategy: fetch the public URL then re-upload with type:authenticated
    try {
      console.log('   → migrating…')

      // 1. Download the current file via its public URL
      const fetchRes = await fetch(url)
      if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status} fetching ${url}`)
      const buffer = Buffer.from(await fetchRes.arrayBuffer())

      // 2. Delete the old public asset
      await cloudinary.uploader.destroy(pubId, { resource_type: 'image', type: 'upload' })
        .catch(() => { /* ignore if already deleted */ })

      // 3. Re-upload as type:authenticated, keeping the same public_id
      const uploaded = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            public_id:    pubId,
            type:         'authenticated',
            resource_type:'auto',
            overwrite:    true,
          },
          (err, result) => err ? reject(err) : resolve(result),
        ).end(buffer)
      })

      // 4. Update the DB record
      const newUrl = uploaded.secure_url
      await db.execute({
        sql:  `UPDATE ${table} SET ${urlCol} = ? WHERE ${idCol} = ?`,
        args: [newUrl, rowId],
      })

      console.log(`   ✅ Migrated → ${newUrl}\n`)
      migrated++
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}\n`)
      errors++
    }
  }

  return { table: label, checked: rows.length, public: rows.length, migrated, errors }
}

// ── Run ───────────────────────────────────────────────────────────────────────

console.log(`\n🔍  Cloudinary Type Audit — ${MIGRATE ? 'MIGRATE MODE' : 'DRY-RUN MODE'}`)
console.log(`    Tables: ${targets.map(t => t.label).join(', ')}\n`)

let totalPublic = 0
let totalMigrated = 0
let totalErrors = 0

for (const target of targets) {
  const stats = await auditTable(target)
  totalPublic   += stats.public
  totalMigrated += stats.migrated
  totalErrors   += stats.errors
}

console.log('\n── Summary ──────────────────────────────────────────────────')
console.log(`   Public (upload) files found : ${totalPublic}`)
if (MIGRATE) {
  console.log(`   Successfully migrated       : ${totalMigrated}`)
  console.log(`   Errors                      : ${totalErrors}`)
} else {
  console.log(`   Run with --migrate to re-upload these as type:authenticated`)
}
console.log('')

process.exit(totalErrors > 0 ? 1 : 0)
