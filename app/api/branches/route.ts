import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canManageBranches } from '@/lib/branch-scope'
import { z } from 'zod'

const branchSchema = z.object({
  code: z.string().min(1, 'กรุณาระบุรหัสสาขา').max(20),
  name: z.string().min(1, 'กรุณาระบุชื่อสาขา'),
  nameEn: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  radiusMeters: z.number().min(10).max(10000).optional(),
  googleMapPlaceId: z.string().optional().nullable(),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canManageBranches(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const branches = await prisma.companyBranch.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { users: true } } },
    })

    return NextResponse.json({
      branches: branches.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        nameEn: b.nameEn ?? '',
        address: b.address ?? '',
        phone: b.phone ?? '',
        isActive: b.isActive,
        isDefault: b.isDefault,
        lat: b.lat ?? null,
        lng: b.lng ?? null,
        radiusMeters: b.radiusMeters,
        googleMapPlaceId: b.googleMapPlaceId ?? null,
        userCount: b._count.users,
        createdAt: b.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !canManageBranches(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = branchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' },
        { status: 400 },
      )
    }

    const data = parsed.data
    const code = data.code.trim().toUpperCase()

    const dup = await prisma.companyBranch.findUnique({ where: { code } })
    if (dup) {
      return NextResponse.json({ error: 'รหัสสาขานี้มีอยู่แล้ว' }, { status: 409 })
    }

    if (data.isDefault) {
      await prisma.companyBranch.updateMany({ data: { isDefault: false } })
    }

    const branch = await prisma.companyBranch.create({
      data: {
        code,
        name: data.name.trim(),
        nameEn: data.nameEn?.trim() || null,
        address: data.address?.trim() || null,
        phone: data.phone?.trim() || null,
        isActive: data.isActive ?? true,
        isDefault: data.isDefault ?? false,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        radiusMeters: data.radiusMeters ?? 100,
        googleMapPlaceId: data.googleMapPlaceId ?? null,
      },
    })

    return NextResponse.json({ branch }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
