import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const userId = searchParams.get('userId')

  const isManager = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)

  if (userId && userId !== session.user.id && !isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const whereUserId = isManager && !userId ? undefined : (userId ?? session.user.id)

  const payrolls = await prisma.payroll.findMany({
    where: {
      month,
      year,
      ...(whereUserId ? { userId: whereUserId } : {}),
    },
    include: {
      user: { select: { name: true, employeeId: true, department: true, position: true, socialSecurity: true } },
    },
    orderBy: { user: { name: 'asc' } },
  })

  return NextResponse.json({ payrolls, month, year })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, status } = await req.json()
  const payroll = await prisma.payroll.update({ where: { id }, data: { status } })
  return NextResponse.json({ payroll })
}
