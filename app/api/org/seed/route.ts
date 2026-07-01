import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canManageOrg } from '@/lib/org-permissions'
import { DEFAULT_COMPANY_BRANCHES } from '@/lib/company-branches'
import { seedDefaultOrgStructure } from '@/lib/default-org-structure'
import { requireCsrf } from '@/lib/api-guard'

/** POST — โหลดโครงสร้างฝ่าย/แผนก/ส่วนงานมาตรฐาน (idempotent) */
export async function POST(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr
    const session = await auth()
    if (!session?.user || !canManageOrg(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const allBranches = Boolean(body?.allBranches)
    const branchId = typeof body?.branchId === 'string' ? body.branchId : null

    const branchIds = allBranches
      ? DEFAULT_COMPANY_BRANCHES.map((b) => b.id)
      : branchId
        ? [branchId]
        : []

    if (branchIds.length === 0) {
      return NextResponse.json({ error: 'ระบุ branchId หรือ allBranches: true' }, { status: 400 })
    }

    const results: { branchId: string; code: string; divisions: number; departments: number; sections: number }[] = []

    for (const id of branchIds) {
      const branch = await prisma.companyBranch.findUnique({ where: { id }, select: { id: true, code: true } })
      if (!branch) continue
      const counts = await seedDefaultOrgStructure(prisma, branch.id)
      results.push({ branchId: branch.id, code: branch.code, ...counts })
    }

    if (results.length === 0) {
      return NextResponse.json({ error: 'ไม่พบสาขา' }, { status: 404 })
    }

    return NextResponse.json({ success: true, results })
  } catch (err) {
    return apiError(err)
  }
}
