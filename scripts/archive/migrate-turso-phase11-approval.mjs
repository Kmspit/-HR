/**
 * Phase 11 — Approval Flow 2.0
 * Turso (libSQL) migration script
 * Run: node scripts/migrate-turso-phase11-approval.mjs
 */
import { createClient } from '@libsql/client'
import * as dotenv from 'dotenv'
dotenv.config()

const client = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const statements = [
  // ── approval_requests ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS approval_requests (
    id             TEXT PRIMARY KEY,
    doc_type       TEXT NOT NULL,
    doc_id         TEXT NOT NULL,
    doc_ref        TEXT,
    title          TEXT NOT NULL,
    requested_by_id TEXT NOT NULL REFERENCES users(id),
    amount         REAL,
    current_step   INTEGER NOT NULL DEFAULT 1,
    total_steps    INTEGER NOT NULL DEFAULT 1,
    status         TEXT NOT NULL DEFAULT 'PENDING',
    priority       TEXT NOT NULL DEFAULT 'NORMAL',
    note           TEXT,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── approval_request_steps ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS approval_request_steps (
    id            TEXT PRIMARY KEY,
    request_id    TEXT NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
    step_order    INTEGER NOT NULL,
    step_name     TEXT NOT NULL,
    approver_role TEXT,
    approver_id   TEXT REFERENCES users(id),
    status        TEXT NOT NULL DEFAULT 'PENDING',
    actor_id      TEXT REFERENCES users(id),
    comment       TEXT,
    ip            TEXT,
    acted_at      DATETIME,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── digital_signatures ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS digital_signatures (
    id               TEXT PRIMARY KEY,
    signed_by_id     TEXT NOT NULL REFERENCES users(id),
    signer_name      TEXT NOT NULL,
    signer_position  TEXT,
    signer_role      TEXT NOT NULL,
    signature_type   TEXT NOT NULL DEFAULT 'TYPED',
    signature_data   TEXT,
    signature_url    TEXT,
    typed_name       TEXT,
    doc_type         TEXT NOT NULL,
    doc_id           TEXT NOT NULL,
    ip               TEXT,
    user_agent       TEXT,
    signed_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── activity_logs ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS activity_logs (
    id           TEXT PRIMARY KEY,
    actor_id     TEXT NOT NULL REFERENCES users(id),
    actor_name   TEXT NOT NULL,
    doc_type     TEXT NOT NULL,
    doc_id       TEXT NOT NULL,
    doc_ref      TEXT,
    action       TEXT NOT NULL,
    detail       TEXT,
    before_value TEXT,
    after_value  TEXT,
    ip           TEXT,
    user_agent   TEXT,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── indexes ──────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_approval_requests_status    ON approval_requests(status)`,
  `CREATE INDEX IF NOT EXISTS idx_approval_requests_doc       ON approval_requests(doc_type, doc_id)`,
  `CREATE INDEX IF NOT EXISTS idx_approval_request_steps_req  ON approval_request_steps(request_id)`,
  `CREATE INDEX IF NOT EXISTS idx_digital_signatures_doc      ON digital_signatures(doc_type, doc_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_logs_doc           ON activity_logs(doc_type, doc_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_logs_actor         ON activity_logs(actor_id)`,
]

async function run() {
  console.log('Running Phase 11 Turso migration…')
  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i]
    const preview = sql.slice(0, 60).replace(/\n/g, ' ')
    try {
      await client.execute(sql)
      console.log(`  ✓ [${i + 1}/${statements.length}] ${preview}…`)
    } catch (err) {
      console.error(`  ✗ [${i + 1}/${statements.length}] ${preview}…`)
      console.error('    ', err.message)
      process.exit(1)
    }
  }
  console.log('Phase 11 migration complete.')
}

run()
