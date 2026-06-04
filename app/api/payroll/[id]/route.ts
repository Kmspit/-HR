import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

const HR_ROLES = ['MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'HR'] as const

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const isHR = (HR_ROLES as readonly string[]).includes(session.user.role)

    const payroll = await prisma.payroll.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            department: true,
            position: true,
            socialSecurity: true,
            baseSalary: true,
            branchId: true,
          },
        },
      },
    })

    if (!payroll) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!isHR && payroll.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!isHR && !['APPROVED', 'SENT'].includes(payroll.status)) {
      return NextResponse.json({ error: 'Not available' }, { status: 404 })
    }

    return NextResponse.json({ payroll })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id || !(HR_ROLES as readonly string[]).includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json() as { status?: string; note?: string }

    const payroll = await prisma.payroll.findUnique({ where: { id } })
    if (!payroll) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updateData: Record<string, unknown> = {}
    if (body.status) updateData.status = body.status
    if (body.note !== undefined) updateData.note = body.note
    if (body.status === 'APPROVED') {
      updateData.approvedById = session.user.id
      updateData.approvedAt = new Date()
    }

    const updated = await prisma.payroll.update({ where: { id }, data: updateData })
    return NextResponse.json({ payroll: updated })
  } catch (err) {
    return apiError(err)
  }
}
