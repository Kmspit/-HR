import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { createAuditLog } from '@/lib/notifications'
import { executeForgotScanStepAction } from '@/lib/forgot-scan-chain'
import { attachDefaultChainForForgotScan } from '@/lib/attach-default-chain'
import { requireCsrf } from '@/lib/api-guard'
import type { Role } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const { id: actorId, role } = session.user
    const { id } = await params
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

    const body = (await req.json()) as { action: 'APPROVE' | 'REJECT'; note?: string }
    if (!['APPROVE', 'REJECT'].includes(body.action)) {
      return NextResponse.json({ error: 'action ต้องเป็น APPROVE หรือ REJECT' }, { status: 400 })
    }

    const request = await prisma.forgotScanRequest.findUnique({ where: { id } })
    if (!request) return NextResponse.json({ error: 'ไม่พบคำขอ' }, { status: 404 })

    if (['APPROVED', 'REJECTED', 'ADMIN_REJECTED'].includes(request.status)) {
      return NextResponse.json({ error: 'คำขอนี้ดำเนินการเสร็จสิ้นแล้ว' }, { status: 400 })
    }

    if (!request.chainConfigId) {
      await attachDefaultChainForForgotScan(prisma, id, request.userId)
    }

    const refreshed = await prisma.forgotScanRequest.findUnique({ where: { id } })
    if (!refreshed?.chainConfigId) {
      return NextResponse.json(
        { error: 'คำขอนี้ยังไม่ได้เชื่อมสายอนุมัติ — กรุณาติดต่อ HR', code: 'NO_CHAIN' },
        { status: 409 },
      )
    }

    const chainResult = await executeForgotScanStepAction(
      prisma,
      id,
      actorId,
      role as Role,
      body.action,
      body.note?.trim(),
      ip,
    )

    if ('error' in chainResult) {
      return NextResponse.json({ error: chainResult.error }, { status: chainResult.status })
    }

    await createAuditLog({
      actorId,
      targetId: id,
      targetType: 'ForgotScanRequest',
      action: body.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
      before: { status: request.status },
      after: { stepName: chainResult.stepName, finalized: chainResult.finalized },
      ip,
    })

    return NextResponse.json(chainResult)
  } catch (err) {
    return apiError(err)
  }
}
