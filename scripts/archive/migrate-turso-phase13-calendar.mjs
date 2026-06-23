import { createClient } from '@libsql/client'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const client = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const statements = [
  // Phase 13 — CalendarEvent
  `CREATE TABLE IF NOT EXISTS calendar_events (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    event_type    TEXT NOT NULL DEFAULT 'INTERNAL',
    start_at      DATETIME NOT NULL,
    end_at        DATETIME,
    all_day       INTEGER NOT NULL DEFAULT 0,
    location      TEXT,
    location_lat  REAL,
    location_lng  REAL,
    description   TEXT,
    court_name    TEXT,
    case_number   TEXT,
    client_name   TEXT,
    debtor_name   TEXT,
    debt_amount   REAL,
    status        TEXT NOT NULL DEFAULT 'SCHEDULED',
    priority      TEXT NOT NULL DEFAULT 'NORMAL',
    department    TEXT,
    attendees     TEXT NOT NULL DEFAULT '[]',
    attachments   TEXT NOT NULL DEFAULT '[]',
    note          TEXT,
    created_by_id TEXT NOT NULL REFERENCES users(id),
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_calendar_events_start_at    ON calendar_events(start_at)`,
  `CREATE INDEX IF NOT EXISTS idx_calendar_events_event_type  ON calendar_events(event_type)`,
  `CREATE INDEX IF NOT EXISTS idx_calendar_events_status      ON calendar_events(status)`,
  `CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by  ON calendar_events(created_by_id)`,
]

let ok = 0, fail = 0
for (const sql of statements) {
  try {
    await client.execute(sql)
    console.log(`✅ OK: ${sql.slice(0, 60).replace(/\n/g, ' ')}…`)
    ok++
  } catch (e) {
    console.error(`❌ FAIL: ${e.message}`)
    fail++
  }
}
console.log(`\nDone: ${ok} OK, ${fail} failed`)
