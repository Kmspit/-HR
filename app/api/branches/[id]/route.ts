import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canManageBranches } from '@/lib/branch-scope'
import { z } from 'zod'

const updateSchema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(1).optional(),
  nameEn: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  radiusMeters: z.number().min(10).max(10000).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id || !canManageBranches(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' },
        { status: 400 },
      )
    }

    const existing = await prisma.companyBranch.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'ไม่พบสาขา' }, { status: 404 })
    }

    const data = parsed.data
    if (data.code) {
      const code = data.code.trim().toUpperCase()
      const dup = await prisma.companyBranch.findFirst({
        where: { code, NOT: { id } },
      })
      if (dup) {
        return NextResponse.json({ error: 'รหัสสาขานี้มีอยู่แล้ว' }, { status: 409 })
      }
    }

    if (data.isDefault) {
      await prisma.companyBranch.updateMany({ data: { isDefault: false } })
    }

    if (data.isActive === false && existing.isDefault) {
      return NextResponse.json(
        { error: 'ไม่สามารถปิดสาขาหลักได้ — ตั้งสาขาอื่นเป็นหลักก่อน' },
        { status: 400 },
      )
    }

    const branch = await prisma.companyBranch.update({
      where: { id },
      data: {
        ...(data.code != null ? { code: data.code.trim().toUpperCase() } : {}),
        ...(data.name != null ? { name: data.name.trim() } : {}),
        ...(data.nameEn !== undefined ? { nameEn: data.nameEn?.trim() || null } : {}),
        ...(data.address !== undefined ? { address: data.address?.trim() || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
        ...(data.lat !== undefined ? { lat: data.lat } : {}),
        ...(data.lng !== undefined ? { lng: data.lng } : {}),
        ...(data.radiusMeters !== undefined ? { radiusMeters: data.radiusMeters } : {}),
      },
    })

    return NextResponse.json({ branch })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id || !canManageBranches(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.companyBranch.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'ไม่พบสาขา' }, { status: 404 })
    }
    if (existing.isDefault) {
      return NextResponse.json({ error: 'ไม่สามารถลบสาขาหลักได้' }, { status: 400 })
    }
    if (existing._count.users > 0) {
      return NextResponse.json(
        { error: `มีพนักงาน ${existing._count.users} คนในสาขานี้ — ย้ายพนักงานก่อนลบ` },
        { status: 400 },
      )
    }

    await prisma.companyBranch.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
