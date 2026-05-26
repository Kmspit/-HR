import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

/** จำนวนใบเตือนของพนักงาน — ใช้คำนวณระดับครั้งถัดไป */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ error: 'ต้องระบุ userId' }, { status: 400 })
    }

    const [total, byLevelRows, user] = await Promise.all([
      prisma.warning.count({ where: { userId } }),
      prisma.warning.groupBy({
        by: ['level'],
        where: { userId },
        _count: { id: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, employeeId: true, department: true },
      }),
    ])

    if (!user) {
      return NextResponse.json({ error: 'ไม่พบพนักงาน' }, { status: 404 })
    }

    const byLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
    for (const row of byLevelRows) {
      byLevel[row.level] = row._count.id
    }

    const nextLevel = Math.min(total + 1, 3)
    const warningNumber = total + 1

    return NextResponse.json({
      userId,
      name: user.name,
      employeeId: user.employeeId,
      department: user.department,
      total,
      warningNumber,
      nextLevel,
      byLevel,
    })
  } catch (err) {
    return apiError(err)
  }
}
