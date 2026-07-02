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
import { validateAppBaseUrl } from '@/lib/payslip-pdf-access'

export const maxDuration = 300

const BATCH_CHUNK = 15

const bodySchema = z.object({
  payrollId: z.string().min(1),
  userId: z.string().optional(),
  branchId: z.string().optional(),
  forceResend: z.boolean().optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(BATCH_CHUNK).optional(),
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

    const baseUrlCheck = validateAppBaseUrl()
    if (!baseUrlCheck.ok) {
      console.error('[payslip/send-line]', baseUrlCheck.error)
      return NextResponse.json({ error: baseUrlCheck.error }, { status: 503 })
    }

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' },
        { status: 400 },
      )
    }

    const { payrollId, userId, branchId, forceResend, offset = 0, limit } = parsed.data

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

    const where = {
      month: anchor.month,
      year: anchor.year,
      status: 'APPROVED' as const,
      ...(userId ? { userId } : {}),
      ...(userRelationFilter ? { user: userRelationFilter } : {}),
      ...(!forceResend && !userId ? { NOT: { payslipSentStatus: 'SUCCESS' as const } } : {}),
    }

    const total = await prisma.payroll.count({ where })
    const take = userId ? 1 : Math.min(limit ?? BATCH_CHUNK, BATCH_CHUNK)

    const payrolls = await prisma.payroll.findMany({
      where,
      select: { id: true, userId: true },
      orderBy: { userId: 'asc' },
      skip: userId ? 0 : offset,
      take,
    })

    if (payrolls.length === 0) {
      const emptyBatchDone = !userId && (offset > 0 || total === 0)
      if (emptyBatchDone) {
        return NextResponse.json({
          success: true,
          sent: 0,
          failed: 0,
          skipped: 0,
          results: [],
          total,
          offset,
          processed: 0,
          hasMore: false,
        })
      }
      return NextResponse.json(
        {
          error: userId
            ? 'ไม่พบ payroll ที่อนุมัติแล้วสำหรับพนักงานนี้'
            : 'ไม่มี payroll ที่รอส่งสลิป LINE ในเดือนนี้',
          total,
          offset,
          processed: 0,
          hasMore: false,
        },
        { status: 404 },
      )
    }

    const results = []
    for (const row of payrolls) {
      results.push(
        await sendPayslipViaLineForPayroll(row.id, {
          forceResend: forceResend ?? false,
        }),
      )
    }

    const sent = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok && !r.skipped).length
    const skipped = results.filter((r) => r.skipped).length
    const processed = payrolls.length
    const hasMore = !userId && offset + processed < total

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
        forceResend: forceResend ?? false,
        offset,
        sent,
        failed,
        skipped,
        payrollIds: payrolls.map((p) => p.id),
      },
      ip,
      userAgent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({
      success: failed === 0,
      sent,
      failed,
      skipped,
      results,
      total,
      offset,
      processed,
      hasMore,
    })
  } catch (err) {
    return apiError(err)
  }
}
