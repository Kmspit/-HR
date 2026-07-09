import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification, sendLineNotify, createAuditLog } from '@/lib/notifications'
import { apiError } from '@/lib/api-handler'
import { canApproveAccounts } from '@/lib/access-control'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import { headers } from 'next/headers'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || !canApproveAccounts(session.user.role)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์อนุมัติบัญชี' }, { status: 403 })
    }

    const { id } = await params
    const body   = await req.json() as { action: 'APPROVE' | 'REJECT'; reason?: string }
    const ip     = (await headers()).get('x-forwarded-for') ?? 'unknown'

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (user.status !== 'PENDING') return NextResponse.json({ error: 'User is not pending' }, { status: 400 })

    const scope = buildBranchScope(session.user, {})
    const inScope = await prisma.user.findFirst({
      where: branchUserWhere(scope, { id }),
      select: { id: true },
    })
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const newStatus = body.action === 'APPROVE' ? 'ACTIVE' : 'REJECTED'

    await prisma.user.update({
      where: { id },
      data: { status: newStatus, approvedById: session.user.id, approvedAt: new Date() },
    })

    // Audit log is a compliance record and must be guaranteed to have actually
    // been written before responding — a serverless function invocation can
    // be frozen/torn down right after the response is sent, so an un-awaited
    // write here would not be guaranteed to complete. createAuditLog already
    // catches and logs its own errors internally, so awaiting it can't make
    // this request fail — it only guarantees the write is attempted and
    // finished first.
    await createAuditLog({
      actorId:    session.user.id,
      targetId:   id,
      targetType: 'User',
      action:     body.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
      before:     { status: 'PENDING' },
      after:      { status: newStatus },
      ip,
    })

    // Notification + LINE push are best-effort side-channels the client's
    // response doesn't depend on — fire-and-forget these.
    void createNotification({
      userId:  id,
      type:    body.action === 'APPROVE' ? 'ACCOUNT_APPROVED' : 'ACCOUNT_REJECTED',
      title:   body.action === 'APPROVE' ? '✅ บัญชีได้รับการอนุมัติ' : '❌ คำขอถูกปฏิเสธ',
      message: body.action === 'APPROVE'
        ? 'บัญชีของคุณได้รับการอนุมัติแล้ว — รอ HR กำหนดฝ่าย แผนก และส่วนงานก่อนใช้งานเต็มรูปแบบ'
        : `คำขอสมัครของคุณถูกปฏิเสธ${body.reason ? `: ${body.reason}` : ''} กรุณาติดต่อ HR`,
    })

    const statusLabel = body.action === 'APPROVE' ? 'อนุมัติแล้ว ✅' : 'ถูกปฏิเสธ ❌'
    void sendLineNotify(
      `\n🔔 [เค เอ็ม เซอร์วิส พลัส] สถานะบัญชี: ${statusLabel}\nชื่อ: ${user.name}\nอีเมล: ${user.email}\nโดย: ${session.user.name}${body.reason ? `\nเหตุผล: ${body.reason}` : ''}`
    )

    return NextResponse.json({ success: true, status: newStatus })
  } catch (err) {
    return apiError(err)
  }
}
