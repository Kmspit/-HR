/**
 * nationalId-encryption Phase 1 backfill — computes nationalIdEncrypted +
 * nationalIdFp (lib/national-id.ts's encryptedNationalIdFields(), no new
 * encrypt logic here) for every existing User row that has a plaintext
 * nationalId, then writes both new columns.
 *
 * Idempotent — a row already carrying both new columns is skipped, so
 * re-running this script after a partial run (or after backfilling more
 * rows added later) is safe.
 *
 * Self-verifying — after each real write, the row is re-read fresh from the
 * DB (not the in-memory value just computed) and nationalIdEncrypted is
 * decrypted back and compared against that same fresh row's plaintext
 * nationalId. A mismatch is recorded as an error for that row, not thrown —
 * one bad row must never abort the rest of the backfill.
 *
 * Never touches or clears the plaintext nationalId column. Phase 2 (a
 * separate, later, explicitly-approved deploy) is what removes it.
 *
 * Usage:
 *   npx tsx scripts/backfill-nationalid-encrypt.ts --dry-run
 *     Computes + verifies encryption for every row in memory only. No
 *     prisma.user.update, no re-read from DB (nothing was written to read
 *     back) — safe to run anytime, touches nothing.
 *
 *   npx tsx scripts/backfill-nationalid-encrypt.ts
 *     Writes for real. DO NOT run without explicit approval — this updates
 *     every real User row with a nationalId in production.
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

const PAGE_SIZE = 200

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
 *  object instead of a real PrismaClient (same pattern as
 *  scripts/purge-user.mjs's checkPurgeGuard). */
type PrismaLike = {
  user: {
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>
    findUniqueOrThrow: (args: {
      where: { id: string }
      select: { nationalId: true; nationalIdEncrypted: true }
    }) => Promise<{ nationalId: string | null; nationalIdEncrypted: string | null }>
  }
}

/**
 * Processes one row: skip / dry-run-verify-in-memory / write+verify-from-DB.
 * No console output here on purpose — callers (main() below, or a test)
 * decide how to report the outcome.
 */
export async function processRow(
  db: PrismaLike,
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

async function fetchRowsPage(cursor: string | null): Promise<BackfillRow[]> {
  return prisma.user.findMany({
    where: { nationalId: { not: null } },
    select: { id: true, nationalId: true, nationalIdEncrypted: true, nationalIdFp: true },
    orderBy: { id: 'asc' },
    take: PAGE_SIZE,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  })
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  console.log(`\n=== nationalId-encryption backfill — ${dryRun ? 'DRY RUN (no writes)' : 'LIVE (writing to production)'} ===\n`)

  let cursor: string | null = null
  let total = 0
  let skipped = 0
  let succeeded = 0
  const errors: { id: string; reason: string }[] = []

  for (;;) {
    const page = await fetchRowsPage(cursor)
    if (page.length === 0) break

    for (const row of page) {
      total++
      const result = await processRow(prisma, row, { dryRun })
      if (result.outcome === 'skipped') skipped++
      else if (result.outcome === 'success') succeeded++
      else errors.push({ id: result.id, reason: result.reason })
    }

    cursor = page[page.length - 1].id
    if (page.length < PAGE_SIZE) break
  }

  console.log(`ทั้งหมดที่มี nationalId : ${total}`)
  console.log(`ข้าม (มีอยู่แล้ว)       : ${skipped}`)
  console.log(`สำเร็จ + verify ผ่าน    : ${succeeded}`)
  console.log(`error                   : ${errors.length}`)

  if (errors.length > 0) {
    console.log('\nแถวที่ error:')
    for (const e of errors) console.log(`  - userId=${e.id}: ${e.reason}`)
  }

  console.log('')
  if (errors.length > 0) {
    console.log('มี error อย่างน้อย 1 แถว — exit code จะไม่เป็น 0')
    process.exitCode = 1
  } else if (dryRun) {
    console.log('DRY RUN เสร็จสมบูรณ์ — ไม่มีการเขียนข้อมูลจริงเลย')
  } else {
    console.log('BACKFILL เสร็จสมบูรณ์ — เขียนและ verify ผ่านทุกแถว')
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
