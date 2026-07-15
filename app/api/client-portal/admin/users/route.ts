import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { apiError } from '@/lib/api-handler'

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER_HR']

async function guard() {
  const session = await auth()
  if (!session?.user?.id) return null
  if (!ADMIN_ROLES.includes(session.user.role)) return null
  return session
}

export async function GET(req: NextRequest) {
 try {
  const session = await guard()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url             = new URL(req.url)
  const clientCompanyId = url.searchParams.get('clientCompanyId') ?? undefined
  const page            = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const limit           = 20

  const where = clientCompanyId ? { clientCompanyId } : {}

  const [users, total] = await Promise.all([
    prisma.clientPortalUser.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      select: {
        id:             true,
        email:          true,
        fullName:       true,
        phone:          true,
        isActive:       true,
        lastLoginAt:    true,
        createdAt:      true,
        clientCompany:  { select: { id: true, companyName: true } },
      },
    }),
    prisma.clientPortalUser.count({ where }),
  ])

  return NextResponse.json({ users, total, page, pages: Math.ceil(total / limit) })
} catch (err) {
  return apiError(err)
 }
}

export async function POST(req: NextRequest) {
 try {
  const session = await guard()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { clientCompanyId, email, password, fullName, phone } = body

  if (!clientCompanyId || !email || !password || !fullName) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }, { status: 400 })
  }

  const existing = await prisma.clientPortalUser.findUnique({
    where: { email: email.trim().toLowerCase() },
  })
  if (existing) return NextResponse.json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' }, { status: 409 })

  const passwordHash = await bcrypt.hash(password, 12)

  const user = await prisma.clientPortalUser.create({
    data: {
      clientCompanyId,
      email:        email.trim().toLowerCase(),
      passwordHash,
      fullName:     fullName.trim(),
      phone:        phone?.trim() ?? null,
    },
    select: { id: true, email: true, fullName: true, isActive: true, createdAt: true },
  })

  return NextResponse.json({ user }, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}

export async function PATCH(req: NextRequest) {
 try {
  const session = await guard()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, fullName, phone, isActive, password } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (fullName  !== undefined) data.fullName = fullName.trim()
  if (phone     !== undefined) data.phone    = phone?.trim() ?? null
  if (isActive  !== undefined) data.isActive = isActive
  if (password) {
    if (password.length < 8) {
      return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }, { status: 400 })
    }
    data.passwordHash = await bcrypt.hash(password, 12)
  }

  const user = await prisma.clientPortalUser.update({
    where:  { id },
    data,
    select: { id: true, email: true, fullName: true, isActive: true },
  })

  return NextResponse.json({ user })
} catch (err) {
  return apiError(err)
 }
}

export async function DELETE(req: NextRequest) {
 try {
  const session = await guard()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const id  = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.clientPortalUser.delete({ where: { id } })
  return NextResponse.json({ ok: true })
} catch (err) {
  return apiError(err)
 }
}
