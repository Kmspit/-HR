import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canManageOrg } from '@/lib/org-permissions'
import { requireCsrf } from '@/lib/api-guard'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || !canManageOrg(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const branchId = req.nextUrl.searchParams.get('branchId') ?? undefined
    const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
    const departments = await prisma.department.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(divisionId ? { divisionId } : {}),
      },
      include: {
        division: { select: { name: true, code: true } },
        _count: { select: { users: true, sections: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json({
      departments: departments.map((d) => ({
        id: d.id,
        branchId: d.branchId,
        divisionId: d.divisionId,
        divisionName: d.division.name,
        code: d.code,
        name: d.name,
        nameEn: d.nameEn ?? '',
        isActive: d.isActive,
        sortOrder: d.sortOrder,
        sectionCount: d._count.sections,
        userCount: d._count.users,
      })),
    })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr
    const session = await auth()
    if (!session?.user || !canManageOrg(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await req.json()
    const { divisionId, code, name, nameEn, isActive, sortOrder } = body
    if (!divisionId || !code?.trim() || !name?.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุฝ่าย รหัส และชื่อแผนก' }, { status: 400 })
    }
    const division = await prisma.division.findUnique({ where: { id: divisionId } })
    if (!division) return NextResponse.json({ error: 'ไม่พบฝ่าย' }, { status: 400 })

    const department = await prisma.department.create({
      data: {
        branchId: division.branchId,
        divisionId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        nameEn: nameEn?.trim() || null,
        isActive: isActive !== false,
        sortOrder: sortOrder ?? 0,
      },
    })
    return NextResponse.json({ department }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
