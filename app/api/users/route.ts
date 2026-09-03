import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'
import { CASE_CREATE_ROLES } from '@/lib/case-permissions'

/**
 * Minimal active-employee list — currently only consumed by CasesClient's
 * case-assignee picker (fetch('/api/users?status=ACTIVE&minimal=1')), which
 * has had no matching route since the Cases feature was first built
 * (2026-06-15, commit 129b3e2 — confirmed via git log, never existed and was
 * never deleted, not a regression). Always filters status ACTIVE regardless
 * of the query string — there's no current use case for listing any other
 * status through this endpoint, so the incoming `status`/`minimal` params
 * are accepted for compatibility with the existing caller but not otherwise
 * interpreted. Gated to CASE_CREATE_ROLES since that's the only consumer
 * today; broaden this (and reconsider the gate) if a second consumer needs
 * a general employee-listing endpoint.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CASE_CREATE_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เรียกดูรายชื่อพนักงาน' }, { status: 403 })
    }

    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, role: true, department: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ users })
  } catch (err) {
    return apiError(err)
  }
}
