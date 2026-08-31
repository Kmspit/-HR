import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { PAYROLL_DELETE_ROLES } from '@/lib/access-control'
import { ensurePayrollPayslipColumns } from '@/lib/ensure-payroll-payslip-columns'
import { createAuditLog } from '@/lib/notifications'
import { restoreSoftDeleted } from '@/lib/soft-delete'

function requestIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

/** Restore a soft-deleted payroll (and its salary slip) — same role gate as
 * DELETE (PAYROLL_DELETE_ROLES: SUPER_ADMIN/CEO only). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    if (!PAYROLL_DELETE_ROLES.includes(session.user.role)) {
      const target = await prisma.payroll.findUnique({ where: { id }, select: { userId: true } })
      await createAuditLog({
        actorId: session.user.id,
        targetId: target?.userId ?? id,
        targetType: 'Payroll',
        action: 'UPDATE',
        after: { payrollId: id, restoreForbidden: true, attemptedRole: session.user.role },
        ip: requestIp(req),
        userAgent: req.headers.get('user-agent') ?? undefined,
      })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await ensurePayrollPayslipColumns()

    const existing = await prisma.payroll.findUnique({
      where: { id },
      select: { id: true, userId: true, deletedAt: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const result = await restoreSoftDeleted({
      currentDeletedAt: existing.deletedAt,
      update: (data) =>
        prisma.$transaction(async (tx) => {
          await tx.payroll.update({ where: { id }, data })
          await tx.salarySlip.updateMany({ where: { payrollId: id }, data })
        }),
      audit: {
        actorId: session.user.id,
        targetId: existing.userId,
        targetType: 'Payroll',
        ip: requestIp(req),
        userAgent: req.headers.get('user-agent') ?? undefined,
      },
      auditExtra: { payrollId: id },
    })

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
