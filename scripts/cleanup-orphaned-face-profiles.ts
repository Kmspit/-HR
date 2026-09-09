/**
 * Cleans up orphaned user_face_profiles rows — a UserFaceProfile whose
 * userId no longer resolves to any row in `users`. Found during the
 * biometric-consent feature's pre-implementation face-recognition audit
 * (2026-09-09): 1 confirmed orphan in production, most likely left behind
 * by an account deletion that predates the FK-gap hardening added to
 * scripts/purge-user.mjs during the same review. Separate concern from
 * that hardening — this only cleans up a pre-existing orphan, it does not
 * change how future purges behave.
 *
 * Unlike scripts/backfill-nationalid-encrypt.ts this has no --batch-size:
 * the orphan set here is small and bounded (a handful of rows at most, not
 * a table-wide sweep), so one dry-run + one confirmed real run is enough —
 * still always --dry-run first per the standing live-DB-script rule.
 *
 * Usage:
 *   npx tsx scripts/cleanup-orphaned-face-profiles.ts --dry-run
 *     Reports every orphaned row (id, userId, registeredAt). Deletes
 *     nothing.
 *
 *   npx tsx scripts/cleanup-orphaned-face-profiles.ts [--yes]
 *     Deletes every orphaned row found. Without --yes, prompts for
 *     confirmation first (same pattern as scripts/purge-user.mjs).
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { createInterface } from 'readline'
import { pathToFileURL } from 'url'

config({ path: resolve(process.cwd(), '.env') })

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

const prisma =
  url && token
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
    : new PrismaClient()

export type OrphanedProfile = {
  id: string
  userId: string
  registeredAt: string
}

type OrphanDb = {
  $queryRawUnsafe: <T = unknown>(query: string) => Promise<T>
}

/** Anti-join via raw SQL: user_face_profiles has no real FK to users.id
 *  (same "declared but unenforced" class of gap as several other tables in
 *  this schema), so Prisma's relational query API has no native way to
 *  express "rows whose userId matches nothing" — a plain findMany can't
 *  filter on a relation that isn't declared. */
export async function findOrphanedFaceProfiles(db: OrphanDb): Promise<OrphanedProfile[]> {
  return db.$queryRawUnsafe<OrphanedProfile[]>(`
    SELECT id, userId, registeredAt
    FROM user_face_profiles
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE users.id = user_face_profiles.userId)
    ORDER BY registeredAt ASC
  `)
}

type DeleteDb = {
  userFaceProfile: {
    delete: (args: { where: { id: string } }) => Promise<unknown>
  }
}

export type DeleteOutcome = { id: string; outcome: 'deleted' } | { id: string; outcome: 'error'; reason: string }

/** Deletes the given rows one at a time so a single failure doesn't abort
 *  the rest of a (small) batch — same defensive shape as
 *  backfill-nationalid-encrypt.ts's per-row error handling. */
export async function deleteOrphanedFaceProfiles(
  db: DeleteDb,
  orphans: OrphanedProfile[],
): Promise<DeleteOutcome[]> {
  const results: DeleteOutcome[] = []
  for (const o of orphans) {
    try {
      await db.userFaceProfile.delete({ where: { id: o.id } })
      results.push({ id: o.id, outcome: 'deleted' })
    } catch (err) {
      results.push({ id: o.id, outcome: 'error', reason: err instanceof Error ? err.message : String(err) })
    }
  }
  return results
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => {
    rl.question(question, (answer) => {
      rl.close()
      res(answer.trim().toLowerCase())
    })
  })
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const yes = process.argv.includes('--yes')

  const orphans = await findOrphanedFaceProfiles(prisma)

  console.log(`\n=== user_face_profiles orphan cleanup — พบ ${orphans.length} แถวที่ userId ไม่มีอยู่จริงใน users ===\n`)

  if (orphans.length === 0) {
    console.log('ไม่มีแถวกำพร้า — ไม่ต้องทำอะไรเพิ่ม')
    return
  }

  for (const o of orphans) {
    console.log(`  - id=${o.id}  userId=${o.userId}  registeredAt=${o.registeredAt}`)
  }

  if (dryRun) {
    console.log('\n--dry-run: ไม่มีอะไรถูกลบจริง')
    console.log(`รันจริง: npx tsx scripts/cleanup-orphaned-face-profiles.ts --yes`)
    return
  }

  if (!yes) {
    const answer = await ask(`\nยืนยันลบ ${orphans.length} แถวนี้ถาวร? พิมพ์ yes: `)
    if (answer !== 'yes') {
      console.log('ยกเลิก')
      return
    }
  }

  const results = await deleteOrphanedFaceProfiles(prisma, orphans)
  const deleted = results.filter((r) => r.outcome === 'deleted').length
  const errors = results.filter((r): r is Extract<DeleteOutcome, { outcome: 'error' }> => r.outcome === 'error')

  console.log(`\nลบสำเร็จ: ${deleted}/${orphans.length}`)
  if (errors.length > 0) {
    console.log('error:')
    for (const e of errors) console.log(`  - id=${e.id}: ${e.reason}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => {
      console.error('ล้มเหลว:', e instanceof Error ? e.message : String(e))
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
