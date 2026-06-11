// Phase 4 — Case Document Center: create 4 new tables on Turso
import { createClient } from '@libsql/client'
import * as dotenv from 'dotenv'
dotenv.config()

const client = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const statements = [
  // Main document record
  `CREATE TABLE IF NOT EXISTS case_documents (
    id            TEXT    NOT NULL PRIMARY KEY,
    title         TEXT    NOT NULL,
    description   TEXT,
    doc_type      TEXT    NOT NULL DEFAULT 'OTHER',
    case_number   TEXT,
    client_name   TEXT,
    department    TEXT,
    task_id       TEXT,
    assigned_to_id TEXT,
    uploaded_by_id TEXT   NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'ACTIVE',
    tags          TEXT,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // Files (versions)
  `CREATE TABLE IF NOT EXISTS case_document_files (
    id             TEXT    NOT NULL PRIMARY KEY,
    document_id    TEXT    NOT NULL,
    file_name      TEXT    NOT NULL,
    file_url       TEXT    NOT NULL,
    public_id      TEXT    NOT NULL,
    file_type      TEXT    NOT NULL,
    file_size      INTEGER,
    version        INTEGER NOT NULL DEFAULT 1,
    uploaded_by_id TEXT    NOT NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES case_documents(id) ON DELETE CASCADE
  )`,

  // Signatures
  `CREATE TABLE IF NOT EXISTS case_document_signatures (
    id              TEXT    NOT NULL PRIMARY KEY,
    document_id     TEXT    NOT NULL,
    signed_by_id    TEXT    NOT NULL,
    signer_name     TEXT    NOT NULL,
    signer_role     TEXT    NOT NULL,
    signer_position TEXT,
    signature_type  TEXT    NOT NULL DEFAULT 'TYPED',
    signature_data  TEXT,
    signature_url   TEXT,
    typed_name      TEXT,
    signed_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES case_documents(id) ON DELETE CASCADE
  )`,

  // Version history / audit trail
  `CREATE TABLE IF NOT EXISTS case_document_versions (
    id             TEXT    NOT NULL PRIMARY KEY,
    document_id    TEXT    NOT NULL,
    version_number INTEGER NOT NULL,
    change_note    TEXT,
    changed_by_id  TEXT    NOT NULL,
    changed_by_name TEXT   NOT NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES case_documents(id) ON DELETE CASCADE
  )`,
]

console.log('Running Phase 4 Turso migration: case_documents tables...')

for (const sql of statements) {
  const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] ?? '?'
  try {
    await client.execute(sql)
    console.log(`  ✅ ${tableName}`)
  } catch (err) {
    console.error(`  ❌ ${tableName}:`, err.message)
    process.exit(1)
  }
}

console.log('Done.')
process.exit(0)
