/**
 * Runs after every `next build` (npm postbuild hook, see package.json).
 * Applies pending ensure-db-schema.ts ADD COLUMN/CREATE INDEX changes to Turso
 * *before* Vercel routes traffic to the new deployment — closes the gap where
 * a fresh deploy's Prisma client expects columns the daily cron hasn't added yet.
 * Never fails the build: on any error we log and exit 0, falling back to the
 * existing daily cron (/api/cron/schema-migrate) as before this script existed.
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env') })

import { ensureDbSchema, CURRENT_SCHEMA_VERSION } from '../lib/ensure-db-schema'

async function main() {
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

main()
  .catch((err) => {
    console.error('[postbuild-ensure-schema] Non-fatal error (deploy continues, daily cron will retry):', err)
  })
  .finally(() => process.exit(0))
