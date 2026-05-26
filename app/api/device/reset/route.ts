import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

/** HR/Admin อนุมัติรีเซ็ตเครื่อง — body: { userId, newDeviceKey? } */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId, newDeviceKey } = await req.json()
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const device = await prisma.userDevice.findUnique({ where: { userId } })
    if (!device) return NextResponse.json({ error: 'ไม่พบข้อมูลเครื่อง' }, { status: 404 })

    const updated = await prisma.userDevice.update({
      where: { userId },
      data: {
        status: 'ACTIVE',
        resetRequestedAt: null,
        ...(newDeviceKey ? { deviceKey: String(newDeviceKey).trim() } : {}),
        lastSeenAt: new Date(),
      },
    })

    return NextResponse.json({ success: true, device: updated })
  } catch (err) {
    return apiError(err)
  }
}
