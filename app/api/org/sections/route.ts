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
    const departmentId = req.nextUrl.searchParams.get('departmentId') ?? undefined
    const sections = await prisma.section.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(departmentId ? { departmentId } : {}),
      },
      include: {
        department: {
          select: { name: true, code: true, division: { select: { name: true } } },
        },
        _count: { select: { users: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json({
      sections: sections.map((s) => ({
        id: s.id,
        branchId: s.branchId,
        departmentId: s.departmentId,
        departmentName: s.department.name,
        divisionName: s.department.division.name,
        code: s.code,
        name: s.name,
        nameEn: s.nameEn ?? '',
        isActive: s.isActive,
        sortOrder: s.sortOrder,
        userCount: s._count.users,
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
    const { departmentId, code, name, nameEn, isActive, sortOrder } = body
    if (!departmentId || !code?.trim() || !name?.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุแผนก รหัส และชื่อส่วนงาน' }, { status: 400 })
    }
    const department = await prisma.department.findUnique({ where: { id: departmentId } })
    if (!department) return NextResponse.json({ error: 'ไม่พบแผนก' }, { status: 400 })

    const section = await prisma.section.create({
      data: {
        branchId: department.branchId,
        departmentId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        nameEn: nameEn?.trim() || null,
        isActive: isActive !== false,
        sortOrder: sortOrder ?? 0,
      },
    })
    return NextResponse.json({ section }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
