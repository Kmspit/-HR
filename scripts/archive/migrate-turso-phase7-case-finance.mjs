import { createClient } from '@libsql/client'
import * as dotenv from 'dotenv'
dotenv.config()

const client = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const statements = [
  // ── case_incomes ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS case_incomes (
    id           TEXT    PRIMARY KEY,
    task_id      TEXT,
    case_number  TEXT,
    client_name  TEXT,
    income_type  TEXT    NOT NULL,
    amount       REAL    NOT NULL DEFAULT 0,
    date         DATETIME NOT NULL,
    note         TEXT,
    department   TEXT,
    created_by_id TEXT   NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── case_expenses ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS case_expenses (
    id            TEXT    PRIMARY KEY,
    task_id       TEXT,
    case_number   TEXT,
    expense_type  TEXT    NOT NULL,
    amount        REAL    NOT NULL DEFAULT 0,
    date          DATETIME NOT NULL,
    employee_id   TEXT    NOT NULL,
    note          TEXT,
    receipt_url   TEXT,
    department    TEXT,
    created_by_id TEXT    NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── expense_claims ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS expense_claims (
    id               TEXT    PRIMARY KEY,
    title            TEXT    NOT NULL,
    task_id          TEXT,
    case_number      TEXT,
    expense_type     TEXT    NOT NULL,
    amount           REAL    NOT NULL DEFAULT 0,
    date             DATETIME NOT NULL,
    note             TEXT,
    status           TEXT    NOT NULL DEFAULT 'PENDING',
    submitted_by_id  TEXT    NOT NULL,
    supervisor_note  TEXT,
    ceo_note         TEXT,
    rejected_note    TEXT,
    paid_at          DATETIME,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── expense_claim_files ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS expense_claim_files (
    id         TEXT    PRIMARY KEY,
    claim_id   TEXT    NOT NULL,
    url        TEXT    NOT NULL,
    public_id  TEXT    NOT NULL DEFAULT '',
    filename   TEXT    NOT NULL,
    file_type  TEXT    NOT NULL,
    size       INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_id) REFERENCES expense_claims(id) ON DELETE CASCADE
  )`,
]

async function run() {
  console.log('Running Phase 7 — Case Finance migration on Turso...')
  for (const sql of statements) {
    const name = sql.trim().split('\n')[0].slice(0, 60)
    try {
      await client.execute(sql)
      console.log('✅', name)
    } catch (err) {
      if (err.message?.includes('already exists')) {
        console.log('⏭️  already exists —', name)
      } else {
        console.error('❌ FAILED:', name)
        console.error(err.message)
      }
    }
  }
  console.log('Migration complete.')
}

run().catch((err) => { console.error(err); process.exit(1) })
