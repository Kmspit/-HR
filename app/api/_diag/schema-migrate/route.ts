import { NextRequest, NextResponse } from 'next/server'

// __SCHEMA_MIGRATE_DIAG_TEMP__ — temporary, remove before merge (see matching
// bypass in middleware.ts). ensureDbSchema() normally only runs via the daily
// cron (app/api/cron/schema-migrate/route.ts) or the main-only postbuild
// script — neither applies to a feature branch that hasn't merged to `main`
// yet, which is exactly why /employees/[id] was erroring with "no such
// column: main.users.payType" on this Preview deployment. This forces the
// same idempotent migration to run for real, from this deployment's own
// bundle, against the real DB.
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('__schemadiag') !== '1f3dd67b010c') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  try {
    const { ensureDbSchema, CURRENT_SCHEMA_VERSION } = await import('@/lib/ensure-db-schema')
    const { prisma } = await import('@/lib/prisma')

    const ok = await ensureDbSchema({ force: true })

    const userCols = await prisma.$queryRawUnsafe<{ name: string }[]>('PRAGMA table_info(users)')
    const payrollCols = await prisma.$queryRawUnsafe<{ name: string }[]>('PRAGMA table_info(payrolls)')

    return NextResponse.json({
      diag: true,
      ok,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      columns: {
        'users.payType': userCols.some((c) => c.name === 'payType'),
        'users.dailyRate': userCols.some((c) => c.name === 'dailyRate'),
        'payrolls.payType': payrollCols.some((c) => c.name === 'payType'),
        'payrolls.daysWorked': payrollCols.some((c) => c.name === 'daysWorked'),
        'payrolls.dailyRateUsed': payrollCols.some((c) => c.name === 'dailyRateUsed'),
      },
    })
  } catch (err) {
    return NextResponse.json(
      { diag: true, ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
