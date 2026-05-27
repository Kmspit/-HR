import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError, runNotify } from '@/lib/api-handler'
import { canManageOrg } from '@/lib/org-permissions'
import { syncUserLegacyDepartment, validateOrgAssignment } from '@/lib/user-org'
import { createNotification } from '@/lib/notifications'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || !canManageOrg(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const { divisionId, departmentId, sectionId } = await req.json()

    if (!divisionId || !departmentId || !sectionId) {
      return NextResponse.json(
        { error: 'กรุณาเลือกฝ่าย แผนก และส่วนงานให้ครบ' },
        { status: 400 },
      )
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, branchId: true, status: true },
    })
    if (!user) return NextResponse.json({ error: 'ไม่พบพนักงาน' }, { status: 404 })

    const valid = await validateOrgAssignment(user.branchId, divisionId, departmentId, sectionId)
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })

    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      include: {
        department: { include: { division: true } },
      },
    })

    await prisma.user.update({
      where: { id },
      data: {
        divisionId,
        departmentId,
        sectionId,
        department: section?.department.name ?? undefined,
      },
    })

    await syncUserLegacyDepartment(id, departmentId)

    if (user.status === 'ACTIVE') {
      await runNotify(() =>
        createNotification({
          userId: id,
          type: 'SYSTEM',
          title: '✅ กำหนดโครงสร้างองค์กรแล้ว',
          message: `ฝ่าย ${section?.department.division.name} · แผนก ${section?.department.name} · ส่วนงาน ${section?.name} — เข้าใช้งานระบบได้แล้ว`,
          link: '/dashboard',
        }),
      )
    }

    return NextResponse.json({
      success: true,
      org: {
        divisionId,
        departmentId,
        sectionId,
        divisionName: section?.department.division.name,
        departmentName: section?.department.name,
        sectionName: section?.name,
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
