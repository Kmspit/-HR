import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const q = searchParams.get('q')?.trim()

  try {
    const clients = await prisma.user.findMany({
      where: {
        role: 'CLIENT',
        ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] } : {}),
      },
      select: {
        id: true, name: true, email: true, phone: true,
        status: true, createdAt: true, department: true,
        _count: { select: { clientTasks: true, clientDocs: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(clients)
  } catch (error) {
    console.error('[clients GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_MANAGE.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, email, phone, password, companyName } = body

  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: 'name, email, password required' }, { status: 400 })
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 })

    const passwordHash = await bcrypt.hash(password, 10)

    const client = await prisma.user.create({
      data: {
        email:        email.trim().toLowerCase(),
        name:         name.trim(),
        passwordHash,
        phone:        phone?.trim() || null,
        role:         'CLIENT',
        status:       'ACTIVE',
        department:   companyName?.trim() || null,
      },
      select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true, department: true },
    })
    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    console.error('[clients POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
