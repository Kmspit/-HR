import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canManageOrg } from '@/lib/org-permissions'
import { getOrgHierarchyGaps } from '@/lib/org-hierarchy-audit'
import type { Role } from '@prisma/client'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManageOrg(session.user.role as Role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const report = await getOrgHierarchyGaps(prisma)
    return NextResponse.json(report)
  } catch (err) {
    return apiError(err)
  }
}
