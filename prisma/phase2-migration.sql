-- Phase 2 Case Management: Extend cases table + 4 new tables
-- Safe to run: uses IF NOT EXISTS / ignores duplicate column errors

-- ── Extend cases table ───────────────────────────────────────────────────
ALTER TABLE "cases" ADD COLUMN "risk_level" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "cases" ADD COLUMN "sla_deadline" DATETIME;
ALTER TABLE "cases" ADD COLUMN "template_id" TEXT;
ALTER TABLE "cases" ADD COLUMN "collected_amount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "cases" ADD COLUMN "legal_fee" REAL NOT NULL DEFAULT 0;
ALTER TABLE "cases" ADD COLUMN "court_fee" REAL NOT NULL DEFAULT 0;
ALTER TABLE "cases" ADD COLUMN "enforcement_fee" REAL NOT NULL DEFAULT 0;

-- ── Index on risk_level ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "cases_risk_level_idx" ON "cases"("risk_level");

-- ── CaseTemplate ─────────────────────────────────────────────────────────
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

-- ── CaseChecklist ─────────────────────────────────────────────────────────
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

-- ── CaseDebtorActivity ───────────────────────────────────────────────────
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

-- ── CaseFinancial ─────────────────────────────────────────────────────────
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
