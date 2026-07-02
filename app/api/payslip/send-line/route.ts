import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireCsrf } from '@/lib/api-guard'
import { canManagePayroll } from '@/lib/access-control'
import { buildBranchScope, branchNestedUserWhere } from '@/lib/branch-scope'
import { sendPayslipViaLineForPayroll } from '@/lib/payslip-line-send'

const bodySchema = z.object({
  payrollId: z.string().min(1),
  userId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canManagePayroll(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' },
        { status: 400 },
      )
    }

    const { payrollId, userId } = parsed.data

    const anchor = await prisma.payroll.findUnique({
      where: { id: payrollId },
      select: { id: true, month: true, year: true },
    })
    if (!anchor) {
      return NextResponse.json({ error: 'ไม่พบ payroll' }, { status: 404 })
    }

    const scope = buildBranchScope(session.user, {})
    const nestedUser = branchNestedUserWhere(scope)

    const payrolls = await prisma.payroll.findMany({
      where: {
        month: anchor.month,
        year: anchor.year,
        status: 'APPROVED',
        ...(userId ? { userId } : {}),
        ...(nestedUser ? { user: nestedUser } : {}),
      },
      select: { id: true, userId: true },
      orderBy: { userId: 'asc' },
    })

    if (payrolls.length === 0) {
      return NextResponse.json(
        { error: userId ? 'ไม่พบ payroll ที่อนุมัติแล้วสำหรับพนักงานนี้' : 'ไม่มี payroll ที่อนุมัติแล้วในเดือนนี้' },
        { status: 404 },
      )
    }

    const results = []
    for (const row of payrolls) {
      results.push(await sendPayslipViaLineForPayroll(row.id))
    }

    const sent = results.filter((r) => r.ok).length
    const failed = results.length - sent

    return NextResponse.json({
      success: failed === 0,
      sent,
      failed,
      results,
    })
  } catch (err) {
    return apiError(err)
  }
}
