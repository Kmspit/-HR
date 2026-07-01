import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-secret'
import { ensureDbSchema, CURRENT_SCHEMA_VERSION } from '@/lib/ensure-db-schema'
import { attachAllPendingDefaultChains } from '@/lib/attach-default-chain'
import { prisma } from '@/lib/prisma'

export const maxDuration = 300

/** Daily schema migration + attach default approval chains (Turso). */
export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const schemaOk = await ensureDbSchema({ force: true })
    const chains = await attachAllPendingDefaultChains(prisma)
    return NextResponse.json({
      ok: schemaOk,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      chains,
    })
  } catch (err) {
    console.error('[cron/schema-migrate]', err)
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 })
  }
}
