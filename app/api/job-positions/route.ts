import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canApproveAccounts } from '@/lib/access-control'

/** Gated at canApproveAccounts (same as the approval modal that consumes
 *  this list), not canManageOrg (HR_ADMIN) — an approver without salary
 *  rights still needs to see position options to complete the unified
 *  approve+org-assign flow (Phase 1 step 7). Position names aren't
 *  sensitive, so this doesn't relax anything meaningful. */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || !canApproveAccounts(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const positions = await prisma.jobPosition.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json({ positions })
  } catch (err) {
    return apiError(err)
  }
}
