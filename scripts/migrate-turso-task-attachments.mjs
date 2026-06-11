/**
 * สร้างตาราง task_attachments บน Turso
 * รัน: node scripts/migrate-turso-task-attachments.mjs
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@libsql/client'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

const url   = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
if (!url || !token) {
  console.error('ต้องมี TURSO_DATABASE_URL และ TURSO_AUTH_TOKEN ใน .env.local')
  process.exit(1)
}

const db = createClient({ url, authToken: token })

const creates = [
  `CREATE TABLE IF NOT EXISTS task_attachments (
    id            TEXT NOT NULL PRIMARY KEY,
    task_id       TEXT NOT NULL,
    file_name     TEXT NOT NULL,
    file_url      TEXT NOT NULL,
    public_id     TEXT NOT NULL,
    file_type     TEXT NOT NULL,
    file_size     INTEGER,
    uploaded_by_id TEXT NOT NULL,
    createdAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT task_attachments_task_id_fkey
      FOREIGN KEY (task_id) REFERENCES task_assignments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT task_attachments_uploaded_by_id_fkey
      FOREIGN KEY (uploaded_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS task_attachments_task_id_idx ON task_attachments(task_id)`,
  `CREATE INDEX IF NOT EXISTS task_attachments_uploaded_by_id_idx ON task_attachments(uploaded_by_id)`,
]

async function run(sql) {
  try {
    await db.execute(sql)
    console.log('OK:', sql.slice(0, 70) + '...')
    return true
  } catch (e) {
    const msg = String(e.message ?? e)
    if (msg.includes('duplicate column') || msg.includes('already exists')) {
      console.log('skip (มีแล้ว):', sql.slice(0, 50))
      return true
    }
    console.error('FAIL:', msg, '\n  ', sql.slice(0, 100))
    return false
  }
}

console.log('Migrating Turso:', url)
for (const s of creates) await run(s)
console.log('Done.')
