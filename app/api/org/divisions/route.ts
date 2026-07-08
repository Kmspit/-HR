import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canManageOrg } from '@/lib/org-permissions'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || !canManageOrg(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const branchId = req.nextUrl.searchParams.get('branchId') ?? undefined
    const divisions = await prisma.division.findMany({
      where: branchId ? { branchId } : {},
      include: { _count: { select: { users: true, departments: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json({
      divisions: divisions.map((d) => ({
        id: d.id,
        branchId: d.branchId,
        code: d.code,
        name: d.name,
        nameEn: d.nameEn ?? '',
        isActive: d.isActive,
        sortOrder: d.sortOrder,
        departmentCount: d._count.departments,
        userCount: d._count.users,
      })),
    })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || !canManageOrg(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await req.json()
    const { branchId, code, name, nameEn, isActive, sortOrder } = body
    if (!branchId || !code?.trim() || !name?.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุสาขา รหัส และชื่อฝ่าย' }, { status: 400 })
    }
    const branch = await prisma.companyBranch.findFirst({
      where: { id: branchId, isActive: true },
    })
    if (!branch) return NextResponse.json({ error: 'ไม่พบสาขา' }, { status: 400 })

    const division = await prisma.division.create({
      data: {
        branchId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        nameEn: nameEn?.trim() || null,
        isActive: isActive !== false,
        sortOrder: sortOrder ?? 0,
      },
    })
    return NextResponse.json({ division }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
