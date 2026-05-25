import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isSelf = params.id === session.user.id
  const isManager = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)
  if (!isSelf && !isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, email: true, employeeId: true, role: true, status: true,
      department: true, position: true, baseSalary: true, socialSecurity: true,
      isCoworker: true, startDate: true, phone: true, lineId: true, profileImage: true,
      prefix: true, nickname: true, birthDate: true, address: true, nationalId: true,
    },
  })

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ user })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const allowedFields = [
    'name', 'nameEn', 'nickname', 'prefix', 'phone', 'birthDate', 'address',
    'department', 'position', 'baseSalary', 'socialSecurity', 'isCoworker',
    'startDate', 'role', 'status', 'lineId',
  ]

  const data: Record<string, any> = {}
  for (const key of allowedFields) {
    if (key in body) data[key] = body[key]
  }

  if (data.birthDate) data.birthDate = new Date(data.birthDate)
  if (data.startDate) data.startDate = new Date(data.startDate)

  const user = await prisma.user.update({ where: { id: params.id }, data })
  return NextResponse.json({ user })
}
