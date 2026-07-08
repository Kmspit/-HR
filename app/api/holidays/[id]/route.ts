import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { validateHolidayInput } from '@/lib/company-holidays'
import { z } from 'zod'

const holidayTypes = ['SATURDAY', 'SUNDAY', 'PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY'] as const

const patchSchema = z.object({
  holidayName: z.string().min(1).optional(),
  holidayDate: z.string().min(1).optional(),
  holidayType: z.enum(holidayTypes).optional(),
  repeatEveryYear: z.boolean().optional(),
  branchId: z.string().nullable().optional(),
})

function canManageHolidays(role: string) {
  return ['MANAGER_HR', 'ADMIN'].includes(role)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id || !canManageHolidays(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.companyHoliday.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'ไม่พบวันหยุด' }, { status: 404 })
    }

    const body = await req.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' },
        { status: 400 },
      )
    }

    const data = parsed.data
    const merged = {
      holidayName: data.holidayName ?? existing.holidayName,
      holidayDate: data.holidayDate ?? existing.holidayDate.toISOString().slice(0, 10),
      holidayType: data.holidayType ?? existing.holidayType,
      repeatEveryYear: data.repeatEveryYear ?? existing.repeatEveryYear,
    }

    const validated = validateHolidayInput(merged)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    let branchId = existing.branchId
    if ('branchId' in data) {
      branchId =
        data.branchId === '' || data.branchId === 'all' ? null : data.branchId ?? null
      if (branchId) {
        const branch = await prisma.companyBranch.findUnique({ where: { id: branchId } })
        if (!branch) {
          return NextResponse.json({ error: 'ไม่พบสาขาที่เลือก' }, { status: 400 })
        }
      }
    }

    const holiday = await prisma.companyHoliday.update({
      where: { id },
      data: {
        holidayName: merged.holidayName.trim(),
        holidayDate: validated.holidayDate,
        holidayType: merged.holidayType,
        repeatEveryYear: merged.repeatEveryYear,
        branchId,
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
    })

    return NextResponse.json({
      holiday: {
        id: holiday.id,
        holidayName: holiday.holidayName,
        holidayDate: holiday.holidayDate.toISOString().slice(0, 10),
        holidayType: holiday.holidayType,
        repeatEveryYear: holiday.repeatEveryYear,
        branchId: holiday.branchId,
        branchLabel: holiday.branch
          ? `${holiday.branch.name} (${holiday.branch.code})`
          : 'ทุกสาขา',
      },
    })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id || !canManageHolidays(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    await prisma.companyHoliday.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
