/**
 * Phase 10 — Billing & Invoice Management
 * Turso (libSQL) migration script
 * Run: node scripts/migrate-turso-phase10-billing.mjs
 */
import { createClient } from '@libsql/client'
import * as dotenv from 'dotenv'
dotenv.config()

const client = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const statements = [
  // ── billing_invoices ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS billing_invoices (
    id               TEXT PRIMARY KEY,
    invoice_number   TEXT NOT NULL UNIQUE,
    client_company_id TEXT REFERENCES client_companies(id),
    client_name      TEXT NOT NULL,
    client_tax_id    TEXT,
    client_address   TEXT,
    task_id          TEXT REFERENCES task_assignments(id),
    service_type     TEXT NOT NULL,
    line_items       TEXT NOT NULL DEFAULT '[]',
    subtotal         REAL NOT NULL DEFAULT 0,
    vat_rate         REAL NOT NULL DEFAULT 0.07,
    vat_amount       REAL NOT NULL DEFAULT 0,
    wht_rate         REAL NOT NULL DEFAULT 0,
    wht_amount       REAL NOT NULL DEFAULT 0,
    total_amount     REAL NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'DRAFT',
    issue_date       DATETIME NOT NULL,
    due_date         DATETIME NOT NULL,
    paid_amount      REAL NOT NULL DEFAULT 0,
    remaining_amount REAL NOT NULL DEFAULT 0,
    note             TEXT,
    created_by_id    TEXT NOT NULL REFERENCES users(id),
    approved_by_id   TEXT REFERENCES users(id),
    approved_at      DATETIME,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_billing_invoices_status           ON billing_invoices(status)`,
  `CREATE INDEX IF NOT EXISTS idx_billing_invoices_client_company_id ON billing_invoices(client_company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_billing_invoices_due_date          ON billing_invoices(due_date)`,

  // ── billing_payments ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS billing_payments (
    id             TEXT PRIMARY KEY,
    invoice_id     TEXT NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
    amount         REAL NOT NULL,
    paid_at        DATETIME NOT NULL,
    payment_method TEXT NOT NULL,
    bank_account   TEXT,
    slip_url       TEXT,
    slip_public_id TEXT,
    received_by_id TEXT REFERENCES users(id),
    note           TEXT,
    created_by_id  TEXT NOT NULL REFERENCES users(id),
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_billing_payments_invoice_id ON billing_payments(invoice_id)`,

  // ── billing_receipts ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS billing_receipts (
    id             TEXT PRIMARY KEY,
    receipt_number TEXT NOT NULL UNIQUE,
    invoice_id     TEXT NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
    payment_id     TEXT REFERENCES billing_payments(id),
    amount         REAL NOT NULL,
    vat_amount     REAL NOT NULL DEFAULT 0,
    wht_amount     REAL NOT NULL DEFAULT 0,
    total_amount   REAL NOT NULL,
    receiver_name  TEXT NOT NULL,
    issued_at      DATETIME NOT NULL,
    note           TEXT,
    created_by_id  TEXT NOT NULL REFERENCES users(id),
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_billing_receipts_invoice_id ON billing_receipts(invoice_id)`,
]

async function run() {
  console.log(`Running Phase 10 Turso migration — ${statements.length} statements`)
  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i]
    try {
      await client.execute(sql)
      console.log(`  [${i + 1}/${statements.length}] OK`)
    } catch (err) {
      console.error(`  [${i + 1}/${statements.length}] FAILED:`, err.message)
      process.exit(1)
    }
  }
  console.log('Migration complete.')
}

run()
