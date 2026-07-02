import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireCsrf } from '@/lib/api-guard'
import { canManagePayroll } from '@/lib/access-control'
import { buildBranchScope, branchNestedUserWhere, branchUserWhere } from '@/lib/branch-scope'
import { sendPayslipViaLineForPayroll } from '@/lib/payslip-line-send'
import { ensurePayrollPayslipColumns } from '@/lib/ensure-payroll-payslip-columns'
import { resolveLineChannelAccessToken } from '@/lib/line-credentials'
import { createAuditLog } from '@/lib/notifications'

export const maxDuration = 300

const BATCH_MAX = 50

const bodySchema = z.object({
  payrollId: z.string().min(1),
  userId: z.string().optional(),
  branchId: z.string().optional(),
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

    const tokenResolve = await resolveLineChannelAccessToken()
    if (!tokenResolve.token) {
      console.error('[payslip/send-line] LINE token missing — set LINE_CHANNEL_ACCESS_TOKEN on Vercel')
      return NextResponse.json(
        {
          error:
            'ไม่พบ LINE Channel Access Token — ตั้ง LINE_CHANNEL_ACCESS_TOKEN บน Vercel ให้ตรงกับ LINE Official Account แล้ว Redeploy',
        },
        { status: 503 },
      )
    }
    if (tokenResolve.tokenValid === false) {
      console.error('[payslip/send-line] LINE token invalid', {
        source: tokenResolve.tokenSourceDetail ?? tokenResolve.source,
        validationError: tokenResolve.validationError,
        hint: 'Issue new token in LINE Developers → Messaging API → match Vercel LINE_CHANNEL_ACCESS_TOKEN',
      })
      return NextResponse.json(
        {
          error:
            tokenResolve.validationError ??
            'LINE Access Token ไม่ถูกต้องหรือหมดอายุ — Issue token ใหม่ใน LINE Developers แล้วอัปเดต Vercel',
          tokenSource: tokenResolve.tokenSourceDetail ?? tokenResolve.source,
        },
        { status: 503 },
      )
    }

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' },
        { status: 400 },
      )
    }

    const { payrollId, userId, branchId } = parsed.data

    await ensurePayrollPayslipColumns()

    const scope = buildBranchScope(session.user, { branchId })
    const nestedUser = branchNestedUserWhere(scope)

    const anchor = await prisma.payroll.findUnique({
      where: { id: payrollId },
      select: { id: true, month: true, year: true, userId: true },
    })
    if (!anchor) {
      return NextResponse.json({ error: 'ไม่พบ payroll' }, { status: 404 })
    }

    const anchorInScope = await prisma.user.findFirst({
      where: branchUserWhere(scope, { id: anchor.userId }),
      select: { id: true },
    })
    if (!anchorInScope) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const userRelationFilter = userId
      ? nestedUser
      : { ...(nestedUser ?? {}), lineUserId: { not: null } }

    const payrolls = await prisma.payroll.findMany({
      where: {
        month: anchor.month,
        year: anchor.year,
        status: 'APPROVED',
        ...(userId ? { userId } : {}),
        ...(userRelationFilter ? { user: userRelationFilter } : {}),
      },
      select: { id: true, userId: true },
      orderBy: { userId: 'asc' },
    })

    if (payrolls.length === 0) {
      return NextResponse.json(
        {
          error: userId
            ? 'ไม่พบ payroll ที่อนุมัติแล้วสำหรับพนักงานนี้'
            : 'ไม่มี payroll ที่อนุมัติแล้วและเชื่อม LINE ในเดือนนี้',
        },
        { status: 404 },
      )
    }

    if (!userId && payrolls.length > BATCH_MAX) {
      return NextResponse.json(
        {
          error: `จำนวนพนักงาน ${payrolls.length} คน เกินขีดจำกัด ${BATCH_MAX} คนต่อครั้ง — กรองสาขาแล้วส่งทีละชุด`,
          count: payrolls.length,
          max: BATCH_MAX,
        },
        { status: 400 },
      )
    }

    const results = []
    for (const row of payrolls) {
      results.push(await sendPayslipViaLineForPayroll(row.id))
    }

    const sent = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok).length

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    await createAuditLog({
      actorId: session.user.id,
      targetType: 'Payroll',
      action: 'UPDATE',
      after: {
        type: 'PAYSLIP_LINE_SEND',
        month: anchor.month,
        year: anchor.year,
        branchId: branchId ?? null,
        userId: userId ?? null,
        sent,
        failed,
        payrollIds: payrolls.map((p) => p.id),
      },
      ip,
      userAgent: req.headers.get('user-agent') ?? undefined,
    })

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
