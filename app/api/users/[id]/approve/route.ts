import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification, sendLineNotify, createAuditLog } from '@/lib/notifications'
import { apiError, runNotify } from '@/lib/api-handler'
import { canApproveAccounts } from '@/lib/permissions'
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

    const newStatus = body.action === 'APPROVE' ? 'ACTIVE' : 'REJECTED'

    await prisma.user.update({
      where: { id },
      data: { status: newStatus, approvedById: session.user.id, approvedAt: new Date() },
    })

    await runNotify(async () => {
      await createAuditLog({
        actorId:    session.user.id,
        targetId:   id,
        targetType: 'User',
        action:     body.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
        before:     { status: 'PENDING' },
        after:      { status: newStatus },
        ip,
      })

      await createNotification({
        userId:  id,
        type:    body.action === 'APPROVE' ? 'ACCOUNT_APPROVED' : 'ACCOUNT_REJECTED',
        title:   body.action === 'APPROVE' ? '✅ บัญชีได้รับการอนุมัติ' : '❌ คำขอถูกปฏิเสธ',
        message: body.action === 'APPROVE'
          ? 'บัญชีของคุณได้รับการอนุมัติแล้ว สามารถเข้าสู่ระบบได้ทันที'
          : `คำขอสมัครของคุณถูกปฏิเสธ${body.reason ? `: ${body.reason}` : ''} กรุณาติดต่อ HR`,
      })

      const statusLabel = body.action === 'APPROVE' ? 'อนุมัติแล้ว ✅' : 'ถูกปฏิเสธ ❌'
      await sendLineNotify(
        `\n🔔 [เค เอ็ม เซอร์วิส พลัส] สถานะบัญชี: ${statusLabel}\nชื่อ: ${user.name}\nอีเมล: ${user.email}\nโดย: ${session.user.name}${body.reason ? `\nเหตุผล: ${body.reason}` : ''}`
      )
    })

    return NextResponse.json({ success: true, status: newStatus })
  } catch (err) {
    return apiError(err)
  }
}
