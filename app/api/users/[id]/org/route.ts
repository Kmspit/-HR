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

    const body = await req.json()

    const divisionId = typeof body.divisionId === 'string' ? body.divisionId : ''

    const departmentId = typeof body.departmentId === 'string' ? body.departmentId : ''

    const sectionId =

      typeof body.sectionId === 'string' && body.sectionId.trim()

        ? body.sectionId.trim()

        : null



    if (!divisionId || !departmentId) {

      return NextResponse.json(

        { error: 'กรุณาเลือกฝ่ายและแผนก' },

        { status: 400 },

      )

    }



    const user = await prisma.user.findUnique({

      where: { id },

      select: { id: true, name: true, email: true, branchId: true, status: true },

    })

    if (!user) return NextResponse.json({ error: 'ไม่พบพนักงาน' }, { status: 404 })



    const valid = await validateOrgAssignment(

      user.branchId,

      divisionId,

      departmentId,

      sectionId,

    )

    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })



    const department = await prisma.department.findUnique({

      where: { id: departmentId },

      include: { division: true },

    })

    const section = sectionId

      ? await prisma.section.findUnique({ where: { id: sectionId } })

      : null



    await prisma.user.update({

      where: { id },

      data: {

        divisionId,

        departmentId,

        sectionId,

        department: department?.name ?? undefined,

      },

    })



    await syncUserLegacyDepartment(id, departmentId)



    if (user.status === 'ACTIVE') {

      const orgLine = section

        ? `ฝ่าย ${department?.division.name} · แผนก ${department?.name} · ส่วนงาน ${section.name}`

        : `ฝ่าย ${department?.division.name} · แผนก ${department?.name}`

      await runNotify(() =>

        createNotification({

          userId: id,

          type: 'SYSTEM',

          title: '✅ กำหนดโครงสร้างองค์กรแล้ว',

          message: `${orgLine} — เข้าใช้งานระบบได้แล้ว`,

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

        divisionName: department?.division.name,

        departmentName: department?.name,

        sectionName: section?.name ?? null,

      },

    })

  } catch (err) {

    return apiError(err)

  }

}


