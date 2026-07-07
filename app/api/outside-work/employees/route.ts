import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import type { Role } from '@prisma/client'

/** รายชื่อพนักงานสำหรับเลือก "ผู้รับผิดชอบ" ในตารางออกนอกสถานที่ — branch-scoped */
export async function GET(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
