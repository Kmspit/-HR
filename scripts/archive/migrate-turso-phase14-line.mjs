/**
 * Turso migration — Phase 14: LINE OA Automation 2.0
 * Adds line_notif_settings column to users table.
 *
 * Usage:
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-turso-phase14-line.mjs
 */
import { createClient } from '@libsql/client'

const url   = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

if (!url || !token) {
  console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set')
  process.exit(1)
}

const client = createClient({ url, authToken: token })

async function run() {
  console.log('[migrate-turso-phase14] connecting to', url)

  // Add line_notif_settings column to users (ignore if already exists)
  await client.execute(`
    ALTER TABLE users ADD COLUMN line_notif_settings TEXT
  `).catch(err => {
    if (String(err).includes('duplicate column name')) {
      console.log('[migrate-turso-phase14] line_notif_settings already exists — skip')
    } else {
      throw err
    }
  })

  console.log('[migrate-turso-phase14] ✅ done')
}

run().catch(err => { console.error(err); process.exit(1) })
