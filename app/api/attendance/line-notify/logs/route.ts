import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { ensureDbSchema } from '@/lib/ensure-db-schema'
import { prisma } from '@/lib/prisma'

/** รายการ log การส่ง LINE หลังลงเวลา (HR/Admin) */
export async function GET(req: NextRequest) {
  try {
    await ensureDbSchema()
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '30', 10))

    const logs = await prisma.attendanceLineNotifyLog.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        employeeUserId: true,
        employeeId: true,
        attendanceId: true,
        scanType: true,
        eventType: true,
        photoUrl: true,
        imageUrl: true,
        status: true,
        sentAt: true,
        failedReason: true,
        retryCount: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      logs: logs.map((l) => ({
        ...l,
        lineStatus: l.status,
        imageUrl: l.imageUrl ?? l.photoUrl,
      })),
    })
  } catch (err) {
    return apiError(err)
  }
}
