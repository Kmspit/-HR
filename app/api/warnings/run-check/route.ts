/**
 * POST /api/warnings/run-check — manual warning check for authorized managers/HR
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runWarningCheck } from '@/lib/warningEngine'
import type { Role } from '@prisma/client'

// Company-wide roles only (matches lib/org-scope.ts's COMPANY_WIDE_APPROVER_ROLES).
// A team-scoped MANAGER used to be allowed here too, but since runWarningCheck()
// always creates PENDING_APPROVAL warnings and MANAGER also holds approve_warning
// for their own reports, that let one person single-handedly propose AND approve
// a warning for their own team with no independent review. Restricting this
// button to company-wide roles keeps proposer and approver different people.
const ALLOWED_ROLES = new Set<Role>([
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN',
])

export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = session.user.role as Role
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const results = await runWarningCheck()
    return NextResponse.json({ success: true, warned: results.length, results })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[warnings/run-check]', message, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
