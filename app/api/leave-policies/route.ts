import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canManageUsers } from '@/lib/access-control'
import type { Role } from '@prisma/client'
import { requireCsrf } from '@/lib/api-guard'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const policies = await prisma.leavePolicy.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] })
    return NextResponse.json({ policies })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManageUsers(session.user.role as Role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const body = (await req.json()) as {
      name: string
      role?: string | null
      isDefault?: boolean
      sickDays?: number
      vacationDays?: number
      personalDays?: number
    }

    if (!body.name?.trim()) return NextResponse.json({ error: 'กรุณาระบุชื่อ Policy' }, { status: 400 })

    // ถ้า isDefault=true → ยกเลิก default ของ policy อื่น
    if (body.isDefault) {
      await prisma.leavePolicy.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
    }

    const policy = await prisma.leavePolicy.create({
      data: {
        name:         body.name.trim(),
        role:         (body.role as Role) || null,
        isDefault:    body.isDefault ?? false,
        sickDays:     body.sickDays     ?? 30,
        vacationDays: body.vacationDays ?? 6,
        personalDays: body.personalDays ?? 3,
      },
    })

    return NextResponse.json({ success: true, policy })
  } catch (err) {
    return apiError(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManageUsers(session.user.role as Role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const body = (await req.json()) as {
      id: string
      name?: string
      role?: string | null
      isDefault?: boolean
      sickDays?: number
      vacationDays?: number
      personalDays?: number
    }

    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    if (body.isDefault) {
      await prisma.leavePolicy.updateMany({
        where: { isDefault: true, id: { not: body.id } },
        data: { isDefault: false },
      })
    }

    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined)         updateData.name         = body.name.trim()
    if (body.role !== undefined)         updateData.role         = body.role || null
    if (body.isDefault !== undefined)    updateData.isDefault    = body.isDefault
    if (body.sickDays !== undefined)     updateData.sickDays     = Math.max(0, body.sickDays)
    if (body.vacationDays !== undefined) updateData.vacationDays = Math.max(0, body.vacationDays)
    if (body.personalDays !== undefined) updateData.personalDays = Math.max(0, body.personalDays)

    const policy = await prisma.leavePolicy.update({ where: { id: body.id }, data: updateData })
    return NextResponse.json({ success: true, policy })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManageUsers(session.user.role as Role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    await prisma.leavePolicy.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
