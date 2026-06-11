// Phase 5 — Client Portal: add client_id columns + 2 new tables on Turso
import { createClient } from '@libsql/client'
import * as dotenv from 'dotenv'
dotenv.config()

const client = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const alterStatements = [
  { table: 'task_assignments', sql: 'ALTER TABLE task_assignments ADD COLUMN client_id TEXT' },
  { table: 'case_documents',   sql: 'ALTER TABLE case_documents ADD COLUMN client_id TEXT' },
]

const createStatements = [
  {
    table: 'case_status_history',
    sql: `CREATE TABLE IF NOT EXISTS case_status_history (
      id              TEXT     NOT NULL PRIMARY KEY,
      task_id         TEXT     NOT NULL,
      status          TEXT     NOT NULL,
      note            TEXT,
      changed_by_id   TEXT,
      changed_by_name TEXT     NOT NULL DEFAULT '',
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES task_assignments(id) ON DELETE CASCADE
    )`,
  },
  {
    table: 'client_messages',
    sql: `CREATE TABLE IF NOT EXISTS client_messages (
      id             TEXT     NOT NULL PRIMARY KEY,
      client_id      TEXT     NOT NULL,
      task_id        TEXT,
      sender_id      TEXT,
      sender_name    TEXT     NOT NULL,
      is_from_client INTEGER  NOT NULL DEFAULT 1,
      content        TEXT     NOT NULL,
      read_at        DATETIME,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
]

console.log('Phase 5 Turso migration: client portal tables...')

for (const { table, sql } of alterStatements) {
  try {
    await client.execute(sql)
    console.log(`  ✅ ALTER ${table}`)
  } catch (err) {
    if (err.message?.includes('duplicate column')) {
      console.log(`  ⏭  ${table} column already exists`)
    } else {
      console.error(`  ❌ ${table}:`, err.message)
      process.exit(1)
    }
  }
}

for (const { table, sql } of createStatements) {
  try {
    await client.execute(sql)
    console.log(`  ✅ CREATE ${table}`)
  } catch (err) {
    console.error(`  ❌ ${table}:`, err.message)
    process.exit(1)
  }
}

console.log('Done.')
process.exit(0)
