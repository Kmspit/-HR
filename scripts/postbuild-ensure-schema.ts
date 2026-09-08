/**
 * Runs after every `next build` (npm postbuild hook, see package.json).
 * Applies pending ensure-db-schema.ts ADD COLUMN/CREATE INDEX changes to Turso
 * *before* Vercel routes traffic to the new deployment — closes the gap where
 * a fresh deploy's Prisma client expects columns the daily cron hasn't added yet.
 * Never fails the build: on any error we log and exit 0, falling back to the
 * existing daily cron (/api/cron/schema-migrate) as before this script existed.
 *
 * Gated behind ALLOW_PROD_SCHEMA_APPLY=true (see shouldRunSchemaSync() below).
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
 * Deliberately NOT keyed on VERCEL_ENV: that variable only has a value when
 * the Vercel project has "Automatically expose System Environment Variables"
 * turned on. If that toggle is off, VERCEL_ENV would be undefined on every
 * build including Production, and a `!== 'preview'`-style check would
 * fail-open (i.e. run) rather than fail-closed. An explicit, single-purpose
 * flag has no such dependency — unset or anything other than exactly 'true'
 * always means "don't run", which is the safe default in every environment.
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

config({ path: resolve(process.cwd(), '.env') })

import { ensureDbSchema, CURRENT_SCHEMA_VERSION } from '../lib/ensure-db-schema'

/**
 * True only when ALLOW_PROD_SCHEMA_APPLY is the exact string 'true'. Every
 * other value — missing, empty, 'false', '1', 'TRUE', anything else — means
 * false. Pure and exported so this decision has its own unit test, separate
 * from exercising the real ensureDbSchema() call.
 */
export function shouldRunSchemaSync(env: Record<string, string | undefined>): boolean {
  return env.ALLOW_PROD_SCHEMA_APPLY === 'true'
}

async function main() {
  if (!shouldRunSchemaSync(process.env)) {
    console.log('[postbuild-ensure-schema] ข้าม — ไม่พบ ALLOW_PROD_SCHEMA_APPLY=true')
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
