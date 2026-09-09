/**
 * Runs after every `next build` (npm postbuild hook, see package.json).
 * Applies pending ensure-db-schema.ts ADD COLUMN/CREATE INDEX changes to Turso
 * *before* Vercel routes traffic to the new deployment — closes the gap where
 * a fresh deploy's Prisma client expects columns the daily cron hasn't added yet.
 * Never fails the build: on any error we log and exit 0, falling back to the
 * existing daily cron (/api/cron/schema-migrate) as before this script existed.
 *
 * Gated on VERCEL_GIT_COMMIT_REF === 'main' (see shouldRunSchemaSync() below).
 * This project has Vercel building a Preview deployment automatically for
 * EVERY pushed git branch, and Preview shares the exact same TURSO_DATABASE_URL
 * as Production (no separate dev DB) — so without this gate, `next build`
 * running unconditionally here meant pushing ANY branch with a bumped
 * CURRENT_SCHEMA_VERSION silently applied that schema change to the real
 * production database the moment Vercel built its Preview, regardless of
 * review status or merge-to-main. Confirmed happening in practice on
 * 2026-09-08 (test/nationalid-encrypt-phase1's v900032 applied via 3 separate
 * Preview builds, hours before that branch was ever reviewed or merged).
 *
 * 2026-09-09: previously gated behind a manually-set ALLOW_PROD_SCHEMA_APPLY=true
 * env var instead. That worked but required remembering to set it (and, in
 * practice this same session, remembering to type the value correctly — a
 * copy-pasted value silently failed to take effect twice) before every
 * schema-bumping merge, and to unset it afterward. Switched to
 * VERCEL_GIT_COMMIT_REF (a Vercel System Environment Variable — confirmed
 * this project has "Automatically expose System Environment Variables"
 * enabled) once we confirmed via Vercel's own docs that it's populated with
 * the plain git branch name the build was triggered from (e.g. "main" or
 * "feature/x"), not a commit hash or a "refs/heads/..." ref — so no manual
 * step is needed per merge any more; merging to main is itself now what
 * flips this on.
 *
 * This is NOT the same class of risk that ruled out keying this off
 * VERCEL_ENV originally: that comparison was `!== 'preview'`, which fails
 * OPEN (runs) if the toggle were ever off and the variable came back
 * undefined on every build, production included. This check is `=== 'main'`
 * — the same shape as the old `=== 'true'` flag comparison — so if the
 * toggle were ever disabled, VERCEL_GIT_COMMIT_REF would be undefined on
 * every build and this would fail CLOSED (skip) even in production, same
 * safe default as before.
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

config({ path: resolve(process.cwd(), '.env') })

import { ensureDbSchema, CURRENT_SCHEMA_VERSION } from '../lib/ensure-db-schema'

/**
 * True only when VERCEL_GIT_COMMIT_REF is the exact string 'main'. Every
 * other value — missing, empty, any other branch name, wrong case ('Main',
 * 'MAIN') — means false. Pure and exported so this decision has its own unit
 * test, separate from exercising the real ensureDbSchema() call.
 */
export function shouldRunSchemaSync(env: Record<string, string | undefined>): boolean {
  return env.VERCEL_GIT_COMMIT_REF === 'main'
}

async function main() {
  if (!shouldRunSchemaSync(process.env)) {
    console.log(`[postbuild-ensure-schema] ข้าม — VERCEL_GIT_COMMIT_REF="${process.env.VERCEL_GIT_COMMIT_REF ?? ''}" ไม่ใช่ "main"`)
    return
  }

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.log('[postbuild-ensure-schema] TURSO_DATABASE_URL/TURSO_AUTH_TOKEN not set — skipping (local build?)')
    return
  }

  console.log(`[postbuild-ensure-schema] Syncing DB schema to v${CURRENT_SCHEMA_VERSION}...`)
  const ok = await ensureDbSchema({ force: true })
  console.log(ok
    ? '[postbuild-ensure-schema] Schema sync complete.'
    : '[postbuild-ensure-schema] ensureDbSchema() returned false — see errors above.')
}

// Running as a script (not imported for its exports, e.g. by tests) — skip
// main() (and its process.exit(0)) on import so requiring this module for
// shouldRunSchemaSync() never touches the DB or exits the test process as a
// side effect. Same guard as scripts/purge-user.mjs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      console.error('[postbuild-ensure-schema] Non-fatal error (deploy continues, daily cron will retry):', err)
    })
    .finally(() => process.exit(0))
}
