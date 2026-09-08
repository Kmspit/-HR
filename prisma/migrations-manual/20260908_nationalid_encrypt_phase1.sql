-- nationalId-encryption Phase 1 step 1 — schema preparation only.
--
-- This repo does not use `prisma migrate` (no prisma/migrations directory —
-- schema changes ship through lib/ensure-db-schema.ts's own idempotent,
-- version-gated runner against the live Turso DB; see CURRENT_SCHEMA_VERSION
-- and migrateUserNationalIdUniqueToFingerprint() in that file, tagged v900032).
-- This file is a human-readable copy of exactly what that migration runs, for
-- review — it is NOT executed by any tool. Applying it is done by deploying
-- ensure-db-schema.ts's v900032 block (which will run automatically via the
-- normal cron/force-run path once this branch reaches production).
--
-- Effect: adds two nullable, additive columns to `users` and moves the
-- @unique constraint from the plaintext nationalId column onto the new
-- deterministic fingerprint column. Writes no data — existing rows keep
-- nationalId populated and get nationalIdEncrypted/nationalIdFp = NULL until
-- scripts/backfill-nationalid-encrypt.ts runs (a separate, explicitly
-- approved step). Reversible by dropping the two new columns and recreating
-- users_nationalId_key if ever needed.

ALTER TABLE users ADD COLUMN nationalIdEncrypted TEXT;
ALTER TABLE users ADD COLUMN nationalIdFp TEXT;

DROP INDEX IF EXISTS "users_nationalId_key";
CREATE UNIQUE INDEX IF NOT EXISTS users_nationalIdFp_key ON users (nationalIdFp);
