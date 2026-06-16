-- Turso migration: Phase 1 + Phase 2 Case Management
-- Safe: uses IF NOT EXISTS + column existence checks are handled by SQLite (ADD COLUMN is idempotent for new DBs)

-- ── task_assignments: add case_id FK ─────────────────────────────────────
ALTER TABLE "task_assignments" ADD COLUMN "case_id" TEXT REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── CaseNumberSeq ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_number_seqs" (
    "year" INTEGER NOT NULL PRIMARY KEY,
    "last" INTEGER NOT NULL DEFAULT 0
);

-- ── Case (includes Phase 2 columns from the start) ───────────────────────
CREATE TABLE IF NOT EXISTS "cases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_number" TEXT NOT NULL,
    "case_title" TEXT NOT NULL,
    "case_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT,
    "debt_amount" REAL,
    "department" TEXT,
    "assigned_employee_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "opened_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" DATETIME,
    "due_date" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "risk_level" TEXT NOT NULL DEFAULT 'MEDIUM',
    "sla_deadline" DATETIME,
    "template_id" TEXT,
    "collected_amount" REAL NOT NULL DEFAULT 0,
    "legal_fee" REAL NOT NULL DEFAULT 0,
    "court_fee" REAL NOT NULL DEFAULT 0,
    "enforcement_fee" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "cases_assigned_employee_id_fkey" FOREIGN KEY ("assigned_employee_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "cases_case_number_key" ON "cases"("case_number");
CREATE INDEX IF NOT EXISTS "cases_status_idx" ON "cases"("status");
CREATE INDEX IF NOT EXISTS "cases_case_type_idx" ON "cases"("case_type");
CREATE INDEX IF NOT EXISTS "cases_priority_idx" ON "cases"("priority");
CREATE INDEX IF NOT EXISTS "cases_risk_level_idx" ON "cases"("risk_level");
CREATE INDEX IF NOT EXISTS "cases_assigned_employee_id_idx" ON "cases"("assigned_employee_id");
CREATE INDEX IF NOT EXISTS "cases_created_at_idx" ON "cases"("created_at");

-- ── CaseClient ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "client_name" TEXT,
    "company_name" TEXT,
    "tax_id" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "contact_person" TEXT,
    "note" TEXT,
    "client_company_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "case_clients_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "case_clients_case_id_key" ON "case_clients"("case_id");

-- ── CaseDebtor ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_debtors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "id_card" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "workplace" TEXT,
    "risk_level" TEXT NOT NULL DEFAULT 'MEDIUM',
    "asset_info" TEXT,
    "note" TEXT,
    "debtor_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "case_debtors_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "case_debtors_case_id_key" ON "case_debtors"("case_id");

-- ── CaseCourt ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_courts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "court_name" TEXT NOT NULL,
    "court_date" DATETIME NOT NULL,
    "appointment_time" TEXT,
    "judge_name" TEXT,
    "result" TEXT,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "case_courts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "case_courts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "case_courts_case_id_idx" ON "case_courts"("case_id");
CREATE INDEX IF NOT EXISTS "case_courts_court_date_idx" ON "case_courts"("court_date");

-- ── CaseTimeline ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_timelines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "meta" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_timelines_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "case_timelines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "case_timelines_case_id_created_at_idx" ON "case_timelines"("case_id", "created_at");

-- ── CaseTemplate (Phase 2) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "case_type" TEXT NOT NULL,
    "department" TEXT,
    "sla_hours" INTEGER NOT NULL DEFAULT 720,
    "checklist_json" TEXT NOT NULL DEFAULT '[]',
    "task_json" TEXT NOT NULL DEFAULT '[]',
    "approval_flow" TEXT,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "case_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "case_templates_case_type_idx" ON "case_templates"("case_type");
CREATE INDEX IF NOT EXISTS "case_templates_is_active_idx" ON "case_templates"("is_active");

-- ── CaseChecklist (Phase 2) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_checklists" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" INTEGER NOT NULL DEFAULT 0,
    "required" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "done_at" DATETIME,
    "done_by_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_checklists_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "case_checklists_done_by_id_fkey" FOREIGN KEY ("done_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "case_checklists_case_id_idx" ON "case_checklists"("case_id");

-- ── CaseDebtorActivity (Phase 2) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_debtor_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL,
    "note" TEXT,
    "promised_date" DATETIME,
    "promised_amount" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_debtor_activities_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "case_debtor_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "case_debtor_activities_case_id_created_at_idx" ON "case_debtor_activities"("case_id", "created_at");

-- ── CaseFinancial (Phase 2) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_financials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_id" TEXT NOT NULL,
    "debt_amount" REAL NOT NULL DEFAULT 0,
    "collected_amount" REAL NOT NULL DEFAULT 0,
    "legal_fee" REAL NOT NULL DEFAULT 0,
    "court_fee" REAL NOT NULL DEFAULT 0,
    "enforcement_fee" REAL NOT NULL DEFAULT 0,
    "other_fee" REAL NOT NULL DEFAULT 0,
    "updated_by_id" TEXT,
    "updated_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_financials_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "case_financials_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "case_financials_case_id_key" ON "case_financials"("case_id");
