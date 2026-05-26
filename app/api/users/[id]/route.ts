import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const isSelf    = id === session.user.id
    const isManager = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)
    if (!isSelf && !isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, employeeId: true, role: true, status: true,
        department: true, position: true, baseSalary: true, socialSecurity: true,
        isCoworker: true, startDate: true, phone: true, lineId: true, profileImage: true,
        prefix: true, nickname: true, birthDate: true, address: true, nationalId: true,
      },
    })

    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ user })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const allowedFields = [
      'name', 'nameEn', 'nickname', 'prefix', 'phone', 'birthDate', 'address',
      'department', 'position', 'baseSalary', 'socialSecurity', 'isCoworker',
      'startDate', 'role', 'status', 'lineId',
    ]

    const data: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (key in body) data[key] = body[key]
    }

    if (data.birthDate) data.birthDate = new Date(data.birthDate as string)
    if (data.startDate) data.startDate = new Date(data.startDate as string)

    const user = await prisma.user.update({ where: { id }, data })
    return NextResponse.json({ user })
  } catch (err) {
    return apiError(err)
  }
}
