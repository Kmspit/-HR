/**
 * Phase 12 — Knowledge Base, SOP & Training System
 * Turso (libSQL) migration script
 * Run: node scripts/migrate-turso-phase12-knowledge.mjs
 */
import { createClient } from '@libsql/client'
import * as dotenv from 'dotenv'
dotenv.config()

const client = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const statements = [
  // ── knowledge_articles ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS knowledge_articles (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    content       TEXT NOT NULL,
    category      TEXT NOT NULL DEFAULT 'GENERAL',
    department    TEXT,
    tags          TEXT,
    status        TEXT NOT NULL DEFAULT 'DRAFT',
    view_count    INTEGER NOT NULL DEFAULT 0,
    created_by_id TEXT NOT NULL REFERENCES users(id),
    approved_by_id TEXT REFERENCES users(id),
    approved_at   DATETIME,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── sop_documents ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS sop_documents (
    id             TEXT PRIMARY KEY,
    sop_code       TEXT NOT NULL UNIQUE,
    title          TEXT NOT NULL,
    department     TEXT NOT NULL,
    description    TEXT,
    steps          TEXT NOT NULL DEFAULT '[]',
    checklist      TEXT NOT NULL DEFAULT '[]',
    related_docs   TEXT NOT NULL DEFAULT '[]',
    status         TEXT NOT NULL DEFAULT 'DRAFT',
    version        INTEGER NOT NULL DEFAULT 1,
    note           TEXT,
    created_by_id  TEXT NOT NULL REFERENCES users(id),
    approved_by_id TEXT REFERENCES users(id),
    approved_at    DATETIME,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── sop_versions ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS sop_versions (
    id            TEXT PRIMARY KEY,
    sop_id        TEXT NOT NULL REFERENCES sop_documents(id) ON DELETE CASCADE,
    version       INTEGER NOT NULL,
    change_note   TEXT,
    snapshot      TEXT,
    changed_by_id TEXT NOT NULL REFERENCES users(id),
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── training_modules ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS training_modules (
    id                TEXT PRIMARY KEY,
    title             TEXT NOT NULL,
    description       TEXT,
    department        TEXT,
    content_type      TEXT NOT NULL DEFAULT 'DOCUMENT',
    content_url       TEXT,
    cover_url         TEXT,
    target_roles      TEXT NOT NULL DEFAULT '[]',
    estimated_minutes INTEGER NOT NULL DEFAULT 30,
    passing_score     INTEGER NOT NULL DEFAULT 70,
    is_required       INTEGER NOT NULL DEFAULT 0,
    status            TEXT NOT NULL DEFAULT 'DRAFT',
    created_by_id     TEXT NOT NULL REFERENCES users(id),
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── training_enrollments ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS training_enrollments (
    id                TEXT PRIMARY KEY,
    module_id         TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
    user_id           TEXT NOT NULL REFERENCES users(id),
    status            TEXT NOT NULL DEFAULT 'NOT_STARTED',
    score             INTEGER,
    time_spent_minutes INTEGER NOT NULL DEFAULT 0,
    started_at        DATETIME,
    completed_at      DATETIME,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(module_id, user_id)
  )`,

  // ── quiz_questions ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS quiz_questions (
    id             TEXT PRIMARY KEY,
    module_id      TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
    question       TEXT NOT NULL,
    options        TEXT NOT NULL DEFAULT '[]',
    question_order INTEGER NOT NULL DEFAULT 0,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── quiz_attempts ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS quiz_attempts (
    id         TEXT PRIMARY KEY,
    module_id  TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id),
    answers    TEXT NOT NULL DEFAULT '[]',
    score      INTEGER NOT NULL,
    passed     INTEGER NOT NULL DEFAULT 0,
    attempt    INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── indexes ──────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_knowledge_articles_status   ON knowledge_articles(status)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_articles_category ON knowledge_articles(category)`,
  `CREATE INDEX IF NOT EXISTS idx_sop_documents_status        ON sop_documents(status)`,
  `CREATE INDEX IF NOT EXISTS idx_sop_documents_department    ON sop_documents(department)`,
  `CREATE INDEX IF NOT EXISTS idx_sop_versions_sop            ON sop_versions(sop_id)`,
  `CREATE INDEX IF NOT EXISTS idx_training_modules_status     ON training_modules(status)`,
  `CREATE INDEX IF NOT EXISTS idx_training_enrollments_user   ON training_enrollments(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_quiz_questions_module       ON quiz_questions(module_id)`,
  `CREATE INDEX IF NOT EXISTS idx_quiz_attempts_module_user   ON quiz_attempts(module_id, user_id)`,
]

async function run() {
  console.log('Running Phase 12 Turso migration…')
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
  console.log('Phase 12 migration complete.')
}

run()
