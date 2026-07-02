import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { requireCsrf } from '@/lib/api-guard'
import { getLineConfigStatus } from '@/lib/line-config'
import { sendLineHrMessage } from '@/lib/line-hr-send'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
    }

    const status = getLineConfigStatus()
    const employees = await prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        department: true,
        employeeId: true,
        lineUserId: true,
        lineDisplayName: true,
      },
      orderBy: { name: 'asc' },
    })
    const linkedCount = employees.filter((e) => e.lineUserId).length

    return NextResponse.json({
      ...status,
      linkedCount,
      totalActive: employees.length,
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        department: e.department,
        employeeId: e.employeeId,
        linked: !!e.lineUserId,
        lineDisplayName: e.lineDisplayName,
      })),
    })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const session = await auth()
    if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ส่งข้อความ LINE' }, { status: 403 })
    }

    const body = (await req.json()) as {
      message?: string
      userId?: string
      broadcastLinked?: boolean
    }

    const result = await sendLineHrMessage({
      message: body.message ?? '',
      userId: body.userId,
      broadcastLinked: !!body.broadcastLinked,
    })

    if (result.sent === 0 && result.errors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          sent: result.sent,
          failed: result.failed,
          errors: result.errors,
          error: result.errors[0],
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: result.ok || result.sent > 0,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
      message:
        result.sent > 1
          ? `ส่งเข้า LINE แล้ว ${result.sent} คน`
          : result.sent === 1
            ? 'ส่งเข้า LINE แล้ว'
            : undefined,
    })
  } catch (err) {
    return apiError(err)
  }
}
