/**
 * nationalId-encryption Phase 1 backfill — computes nationalIdEncrypted +
 * nationalIdFp (lib/national-id.ts's encryptedNationalIdFields(), no new
 * encrypt logic here) for existing User rows that have a plaintext
 * nationalId, then writes both new columns.
 *
 * Runs ONE bounded batch per invocation and stops — never loops through the
 * whole table in a single run, even with approval to process everything.
 * Per CLAUDE.md's batch-operation rule (added after the 2026-09-07 incident):
 * a live-data batch operation must report and stop between chunks, not run
 * continuously to a single end-of-run summary, so a problem mid-way is
 * caught before it spreads to every row. Run the script again (same command)
 * to do the next batch — see --batch-size below for why no extra state file
 * is needed for that.
 *
 * Idempotent — a row already carrying both new columns is excluded from
 * every batch, so re-running this script (to do the next batch, or later to
 * backfill rows added since) is always safe and never re-processes finished
 * rows.
 *
 * Self-verifying — after each real write, the row is re-read fresh from the
 * DB (not the in-memory value just computed) and nationalIdEncrypted is
 * decrypted back and compared against that same fresh row's plaintext
 * nationalId. A mismatch is recorded as an error for that row, not thrown —
 * one bad row must never abort the rest of the batch.
 *
 * Never touches or clears the plaintext nationalId column. Phase 2 (a
 * separate, later, explicitly-approved deploy) is what removes it.
 *
 * Usage:
 *   npx tsx scripts/backfill-nationalid-encrypt.ts --dry-run [--batch-size=N]
 *     Computes + verifies encryption for up to N pending rows in memory
 *     only. No prisma.user.update, no re-read from DB (nothing was written
 *     to read back) — safe to run anytime, touches nothing. Because nothing
 *     is written, re-running the exact same dry-run command processes the
 *     SAME batch again (there is no "next" batch until a real write moves a
 *     row out of "pending").
 *
 *   npx tsx scripts/backfill-nationalid-encrypt.ts [--batch-size=N]
 *     Writes for real, for up to N pending rows, then stops. DO NOT run
 *     without explicit approval. --batch-size defaults to 1 — run the exact
 *     same command again to do the next batch; the pending-rows filter
 *     means it automatically picks up where the previous run left off.
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

config({ path: resolve(process.cwd(), '.env') })

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { encryptedNationalIdFields } from '../lib/national-id'
import { decryptField, FIELD_SALTS } from '../lib/field-crypto'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
const prisma =
  url && token
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
    : new PrismaClient()

/** Every row this script still needs to process — has a plaintext nationalId
 *  but is missing either new column. Used both to fetch a batch (take: N)
 *  and to count how many are left after one. Exported so the query shape is
 *  the single source of truth the tests assert against, not a duplicate
 *  copy. */
export const PENDING_WHERE = {
  nationalId: { not: null },
  OR: [{ nationalIdEncrypted: null }, { nationalIdFp: null }],
}

/** Parses --batch-size=N from argv. Falls back to 1 (the safest default —
 *  one row per invocation, maximum visibility) for a missing, non-numeric,
 *  zero, or negative value rather than silently doing something else. */
export function parseBatchSize(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith('--batch-size='))
  if (!arg) return 1
  const n = Number(arg.slice('--batch-size='.length))
  return Number.isInteger(n) && n > 0 ? n : 1
}

export type BackfillRow = {
  id: string
  nationalId: string | null
  nationalIdEncrypted: string | null
  nationalIdFp: string | null
}

export type RowOutcome =
  | { id: string; outcome: 'skipped' }
  | { id: string; outcome: 'success' }
  | { id: string; outcome: 'error'; reason: string }

/** A row already carrying both new columns is done — re-running the script
 *  must be a no-op for it, not a second (harmless but wasteful, and
 *  needlessly re-randomizes the IV) encryption. */
export function shouldSkipRow(row: Pick<BackfillRow, 'nationalIdEncrypted' | 'nationalIdFp'>): boolean {
  return row.nationalIdEncrypted != null && row.nationalIdFp != null
}

/** The single source of truth for "did this row's encryption round-trip
 *  correctly" — decrypts `nationalIdEncrypted` and compares it to
 *  `nationalId`. Never throws: a decrypt failure (wrong key, corrupted blob)
 *  is reported as a mismatch, not an unhandled crash that would abort the
 *  whole backfill over one bad row. */
export function verifyRoundTrip(nationalId: string, nationalIdEncrypted: string): boolean {
  try {
    return decryptField(nationalIdEncrypted, FIELD_SALTS.USER_NATIONAL_ID) === nationalId
  } catch {
    return false
  }
}

/** Narrow shape processRow() needs from prisma — lets tests pass a mock
 *  object instead of a real PrismaClient, same pattern as
 *  scripts/purge-user.mjs's checkPurgeGuard. Deliberately loose types
 *  (Record<string, unknown>) on `where`/`data` rather than the exact literal
 *  shapes used at the real call sites — an exact `typeof PENDING_WHERE`
 *  (readonly, from an `as const`) doesn't structurally match Prisma's own
 *  mutable generated input types, and precision here isn't the point: the
 *  real query shape is exercised by runBatch()'s tests via a behavioral fake
 *  db, not by this type. */
type ProcessRowDb = {
  user: {
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>
    findUniqueOrThrow: (args: {
      where: { id: string }
      select: { nationalId: true; nationalIdEncrypted: true }
    }) => Promise<{ nationalId: string | null; nationalIdEncrypted: string | null }>
  }
}

/** Adds the two read methods runBatch() needs on top of ProcessRowDb — a
 *  superset, so anything satisfying BatchDb also satisfies ProcessRowDb. */
type BatchDb = ProcessRowDb & {
  user: ProcessRowDb['user'] & {
    findMany: (args: {
      where: Record<string, unknown>
      select: { id: true; nationalId: true; nationalIdEncrypted: true; nationalIdFp: true }
      orderBy: { id: 'asc' }
      take: number
    }) => Promise<BackfillRow[]>
    count: (args: { where: Record<string, unknown> }) => Promise<number>
  }
}

/**
 * Processes one row: skip / dry-run-verify-in-memory / write+verify-from-DB.
 * No console output here on purpose — callers (main() below, or a test)
 * decide how to report the outcome.
 */
export async function processRow(
  db: ProcessRowDb,
  row: BackfillRow,
  opts: { dryRun: boolean },
): Promise<RowOutcome> {
  if (shouldSkipRow(row)) return { id: row.id, outcome: 'skipped' }
  if (!row.nationalId) return { id: row.id, outcome: 'skipped' }

  const enc = encryptedNationalIdFields(row.nationalId)

  if (opts.dryRun) {
    const ok = verifyRoundTrip(row.nationalId, enc.nationalIdEncrypted)
    return ok
      ? { id: row.id, outcome: 'success' }
      : {
          id: row.id,
          outcome: 'error',
          reason: 'dry-run round-trip mismatch — encrypt/decrypt did not return the original value',
        }
  }

  await db.user.update({ where: { id: row.id }, data: enc })

  // Re-read fresh from the DB — never trust the in-memory `enc` we just
  // computed as proof the write actually landed correctly.
  const fresh = await db.user.findUniqueOrThrow({
    where: { id: row.id },
    select: { nationalId: true, nationalIdEncrypted: true },
  })
  if (!fresh.nationalIdEncrypted) {
    return { id: row.id, outcome: 'error', reason: 'nationalIdEncrypted is empty after write (re-read from DB)' }
  }
  if (!fresh.nationalId) {
    return {
      id: row.id,
      outcome: 'error',
      reason: 'nationalId became empty after write — unexpected, this script never touches it',
    }
  }
  const ok = verifyRoundTrip(fresh.nationalId, fresh.nationalIdEncrypted)
  return ok
    ? { id: row.id, outcome: 'success' }
    : {
        id: row.id,
        outcome: 'error',
        reason: 'post-write verify failed — decrypted value does not match the stored plaintext nationalId',
      }
}

export type BatchSummary = {
  batchSize: number
  processed: number
  succeeded: number
  errors: { id: string; reason: string }[]
  remaining: number
}

/**
 * Fetches up to `batchSize` pending rows, processes each one, then counts
 * how many are still pending afterward — one bounded unit of work per call,
 * never more. The caller (main() below, or a test) decides how to report
 * the result and whether to stop the process.
 */
export async function runBatch(db: BatchDb, batchSize: number, dryRun: boolean): Promise<BatchSummary> {
  const batch = await db.user.findMany({
    where: PENDING_WHERE,
    select: { id: true, nationalId: true, nationalIdEncrypted: true, nationalIdFp: true },
    orderBy: { id: 'asc' },
    take: batchSize,
  })

  let succeeded = 0
  const errors: { id: string; reason: string }[] = []
  for (const row of batch) {
    const result = await processRow(db, row, { dryRun })
    if (result.outcome === 'success') succeeded++
    else if (result.outcome === 'error') errors.push({ id: result.id, reason: result.reason })
    // 'skipped' should never happen here — PENDING_WHERE already excludes
    // finished rows. processRow still checks defensively (see shouldSkipRow).
  }

  const remaining = await db.user.count({ where: PENDING_WHERE })

  return { batchSize, processed: batch.length, succeeded, errors, remaining }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const batchSize = parseBatchSize(process.argv)

  console.log(
    `\n=== nationalId-encryption backfill — ${dryRun ? 'DRY RUN (no writes)' : 'LIVE (writing to production)'} — batch size ${batchSize} ===\n`,
  )

  const summary = await runBatch(prisma, batchSize, dryRun)

  console.log(`แถวใน batch นี้        : ${summary.processed}`)
  console.log(`สำเร็จ + verify ผ่าน   : ${summary.succeeded}`)
  console.log(`error                  : ${summary.errors.length}`)
  if (summary.errors.length > 0) {
    console.log('\nแถวที่ error:')
    for (const e of summary.errors) console.log(`  - userId=${e.id}: ${e.reason}`)
  }

  if (summary.remaining === 0) {
    console.log('\nไม่มีแถวเหลือให้ทำแล้ว — backfill เสร็จสมบูรณ์ทุกแถว')
  } else {
    console.log(
      `\nเหลืออีก ${summary.remaining} แถวที่ยังไม่ทำ` +
        (dryRun ? ' (ค่านี้จะไม่ลดจนกว่าจะรันแบบไม่มี --dry-run)' : ''),
    )
    const flags = [`--batch-size=${batchSize}`, ...(dryRun ? ['--dry-run'] : [])].join(' ')
    console.log('รันคำสั่งนี้ซ้ำเพื่อทำ batch ถัดไป:')
    console.log(`  npx tsx scripts/backfill-nationalid-encrypt.ts ${flags}`)
  }

  console.log('')
  if (summary.errors.length > 0) {
    console.log('มี error อย่างน้อย 1 แถวใน batch นี้ — exit code จะไม่เป็น 0')
    process.exitCode = 1
  }
}

// Running as a script (not imported for its exports, e.g. by tests) — skip
// main() on import so requiring this module for its pure functions never
// touches the DB or exits the process as a side effect. Same guard as
// scripts/purge-user.mjs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      console.error('script crashed:', err)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
