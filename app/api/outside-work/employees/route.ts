import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import { CORE_STAFF } from '@/lib/module-gates'
import type { Role } from '@prisma/client'

/**
 * รายชื่อพนักงานสำหรับเลือก "ผู้รับผิดชอบ" ในตารางออกนอกสถานที่ — branch-scoped.
 * Called unconditionally by OutsideWorkExcelForm.tsx's assignee picker for
 * anyone who can open /outside-work, which is gated to CORE_STAFF (every
 * internal-staff role; CLIENT is excluded) — match that gate here too, since
 * API routes get no role check from middleware.ts.
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!CORE_STAFF.includes(session.user.role as Role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const scope = buildBranchScope({ role: session.user.role as Role, branchId: session.user.branchId })

    const employees = await prisma.user.findMany({
      where: branchUserWhere(scope, { status: 'ACTIVE' }),
      select: { id: true, name: true, department: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ employees })
  } catch (err) {
    return apiError(err)
  }
}
