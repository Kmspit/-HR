import { createClient } from '@libsql/client'
import * as dotenv from 'dotenv'
dotenv.config()

const client = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const statements = [
  // ── debtors ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS debtors (
    id             TEXT     PRIMARY KEY,
    debtor_number  TEXT     NOT NULL UNIQUE,
    case_number    TEXT,
    task_id        TEXT,
    first_name     TEXT     NOT NULL,
    last_name      TEXT     NOT NULL,
    national_id    TEXT,
    phone          TEXT,
    phone2         TEXT,
    line_id        TEXT,
    email          TEXT,
    address        TEXT,
    province       TEXT,
    assigned_to_id TEXT,
    status         TEXT     NOT NULL DEFAULT 'NEW',
    total_debt     REAL     NOT NULL DEFAULT 0,
    paid_amount    REAL     NOT NULL DEFAULT 0,
    remaining_debt REAL     NOT NULL DEFAULT 0,
    start_date     DATETIME,
    note           TEXT,
    created_by_id  TEXT     NOT NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_debtors_status        ON debtors(status)`,
  `CREATE INDEX IF NOT EXISTS idx_debtors_assigned_to   ON debtors(assigned_to_id)`,

  // ── debt_follow_ups ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS debt_follow_ups (
    id              TEXT     PRIMARY KEY,
    debtor_id       TEXT     NOT NULL,
    method          TEXT     NOT NULL,
    followed_at     DATETIME NOT NULL,
    result          TEXT     NOT NULL,
    note            TEXT,
    next_follow_up  DATETIME,
    performed_by_id TEXT     NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (debtor_id) REFERENCES debtors(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_debt_follow_ups_debtor ON debt_follow_ups(debtor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_debt_follow_ups_date   ON debt_follow_ups(followed_at)`,

  // ── debt_payments ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS debt_payments (
    id              TEXT     PRIMARY KEY,
    debtor_id       TEXT     NOT NULL,
    amount          REAL     NOT NULL,
    paid_at         DATETIME NOT NULL,
    channel         TEXT     NOT NULL,
    received_by_id  TEXT,
    slip_url        TEXT,
    slip_public_id  TEXT,
    note            TEXT,
    created_by_id   TEXT     NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (debtor_id) REFERENCES debtors(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_debt_payments_debtor ON debt_payments(debtor_id)`,

  // ── payment_appointments ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS payment_appointments (
    id             TEXT     PRIMARY KEY,
    debtor_id      TEXT     NOT NULL,
    appoint_date   DATETIME NOT NULL,
    agreed_amount  REAL     NOT NULL DEFAULT 0,
    location       TEXT,
    note           TEXT,
    status         TEXT     NOT NULL DEFAULT 'PENDING',
    created_by_id  TEXT     NOT NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (debtor_id) REFERENCES debtors(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payment_appts_debtor ON payment_appointments(debtor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_appts_date   ON payment_appointments(appoint_date)`,

  // ── debtor_files ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS debtor_files (
    id            TEXT     PRIMARY KEY,
    debtor_id     TEXT     NOT NULL,
    url           TEXT     NOT NULL,
    public_id     TEXT     NOT NULL DEFAULT '',
    filename      TEXT     NOT NULL,
    file_type     TEXT     NOT NULL,
    size          INTEGER  NOT NULL DEFAULT 0,
    doc_type      TEXT     NOT NULL DEFAULT 'OTHER',
    created_by_id TEXT     NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (debtor_id) REFERENCES debtors(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_debtor_files_debtor ON debtor_files(debtor_id)`,
]

console.log(`Running ${statements.length} statements on Turso …`)
for (const sql of statements) {
  const preview = sql.slice(0, 60).replace(/\n/g, ' ')
  try {
    await client.execute(sql)
    console.log(`  ✓  ${preview}`)
  } catch (err) {
    console.error(`  ✗  ${preview}\n     ${err.message}`)
    process.exit(1)
  }
}
console.log('\nPhase 8 Turso migration complete.')
