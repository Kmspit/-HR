import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification, sendLineNotify, createAuditLog } from '@/lib/notifications'
import { headers } from 'next/headers'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'MANAGER_HR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
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

  // Audit log
  await createAuditLog({
    actorId:    session.user.id,
    targetId:   id,
    targetType: 'User',
    action:     body.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
    before:     { status: 'PENDING' },
    after:      { status: newStatus },
    ip,
  })

  // Notify the user
  await createNotification({
    userId:  id,
    type:    body.action === 'APPROVE' ? 'ACCOUNT_APPROVED' : 'ACCOUNT_REJECTED',
    title:   body.action === 'APPROVE' ? '✅ บัญชีได้รับการอนุมัติ' : '❌ คำขอถูกปฏิเสธ',
    message: body.action === 'APPROVE'
      ? 'บัญชีของคุณได้รับการอนุมัติแล้ว สามารถเข้าสู่ระบบได้ทันที'
      : `คำขอสมัครของคุณถูกปฏิเสธ${body.reason ? `: ${body.reason}` : ''} กรุณาติดต่อ HR`,
  })

  // LINE notify
  const statusLabel = body.action === 'APPROVE' ? 'อนุมัติแล้ว ✅' : 'ถูกปฏิเสธ ❌'
  await sendLineNotify(
    `\n🔔 [HRFlow] สถานะบัญชี: ${statusLabel}\nชื่อ: ${user.name}\nอีเมล: ${user.email}\nโดย: ${session.user.name}${body.reason ? `\nเหตุผล: ${body.reason}` : ''}`
  )

  return NextResponse.json({ success: true, status: newStatus })
}
