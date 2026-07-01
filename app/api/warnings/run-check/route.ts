/**
 * POST /api/warnings/run-check — manual warning check for authorized managers/HR
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runWarningCheck } from '@/lib/warningEngine'

const ALLOWED_ROLES = new Set([
  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER',
])

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ALLOWED_ROLES.has(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const results = await runWarningCheck()
    return NextResponse.json({ success: true, warned: results.length, results })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
