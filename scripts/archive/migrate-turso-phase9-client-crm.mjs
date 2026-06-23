import { createClient } from '@libsql/client'
import * as dotenv from 'dotenv'
dotenv.config()

const client = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const statements = [
  // ── client_companies ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS client_companies (
    id           TEXT     PRIMARY KEY,
    client_code  TEXT     NOT NULL UNIQUE,
    company_name TEXT     NOT NULL,
    contact_name TEXT,
    phone        TEXT,
    email        TEXT,
    line_id      TEXT,
    address      TEXT,
    tax_id       TEXT,
    client_type  TEXT     NOT NULL DEFAULT 'CORPORATE',
    status       TEXT     NOT NULL DEFAULT 'ACTIVE',
    credit_limit REAL,
    start_date   DATETIME,
    end_date     DATETIME,
    note         TEXT,
    created_by_id TEXT    NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_client_companies_status ON client_companies(status)`,

  // ── client_contracts ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS client_contracts (
    id                TEXT     PRIMARY KEY,
    client_company_id TEXT     NOT NULL,
    contract_number   TEXT     NOT NULL UNIQUE,
    service_type      TEXT     NOT NULL,
    start_date        DATETIME NOT NULL,
    end_date          DATETIME NOT NULL,
    value             REAL     NOT NULL DEFAULT 0,
    sla_agreement     TEXT,
    payment_terms     TEXT,
    status            TEXT     NOT NULL DEFAULT 'ACTIVE',
    note              TEXT,
    created_by_id     TEXT     NOT NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_company_id) REFERENCES client_companies(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_client_contracts_company  ON client_contracts(client_company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_client_contracts_end_date ON client_contracts(end_date)`,

  // ── client_sla_records ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS client_sla_records (
    id                TEXT     PRIMARY KEY,
    client_company_id TEXT     NOT NULL,
    contract_id       TEXT,
    task_id           TEXT,
    sla_type          TEXT     NOT NULL,
    target_hours      REAL     NOT NULL,
    actual_hours      REAL,
    met               INTEGER,
    note              TEXT,
    created_by_id     TEXT     NOT NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at       DATETIME,
    FOREIGN KEY (client_company_id) REFERENCES client_companies(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_client_sla_company ON client_sla_records(client_company_id)`,

  // ── client_company_files ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS client_company_files (
    id                TEXT     PRIMARY KEY,
    client_company_id TEXT     NOT NULL,
    contract_id       TEXT,
    url               TEXT     NOT NULL,
    public_id         TEXT     NOT NULL DEFAULT '',
    filename          TEXT     NOT NULL,
    file_type         TEXT     NOT NULL,
    size              INTEGER  NOT NULL DEFAULT 0,
    doc_type          TEXT     NOT NULL DEFAULT 'OTHER',
    created_by_id     TEXT     NOT NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_company_id) REFERENCES client_companies(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_client_company_files_company ON client_company_files(client_company_id)`,

  // ── task_assignments: add client_company_id column ───────────────────────
  `ALTER TABLE task_assignments ADD COLUMN client_company_id TEXT`,
]

console.log(`Running ${statements.length} statements on Turso …`)
for (const sql of statements) {
  const preview = sql.slice(0, 65).replace(/\n/g, ' ')
  try {
    await client.execute(sql)
    console.log(`  ✓  ${preview}`)
  } catch (err) {
    // Ignore "already exists" / "duplicate column" errors
    if (err.message?.includes('already exists') || err.message?.includes('duplicate column')) {
      console.log(`  ↷  (already exists) ${preview}`)
    } else {
      console.error(`  ✗  ${preview}\n     ${err.message}`)
      process.exit(1)
    }
  }
}
console.log('\nPhase 9 Turso migration complete.')
