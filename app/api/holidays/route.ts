import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { validateHolidayInput } from '@/lib/company-holidays'
import type { HolidayType } from '@prisma/client'
import { z } from 'zod'

const holidayTypes = ['SATURDAY', 'SUNDAY', 'PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY'] as const

const createSchema = z.object({
  holidayName: z.string().min(1),
  holidayDate: z.string().min(1),
  holidayType: z.enum(holidayTypes),
  repeatEveryYear: z.boolean().optional(),
  branchId: z.string().nullable().optional(),
})

function canManageHolidays(role: string) {
  return ['MANAGER_HR', 'ADMIN', 'CEO'].includes(role)
}

function serialize(h: {
  id: string
  holidayName: string
  holidayDate: Date
  holidayType: HolidayType
  repeatEveryYear: boolean
  branchId: string | null
  createdAt: Date
  branch?: { id: string; name: string; code: string } | null
}) {
  return {
    id: h.id,
    holidayName: h.holidayName,
    holidayDate: h.holidayDate.toISOString().slice(0, 10),
    holidayType: h.holidayType,
    repeatEveryYear: h.repeatEveryYear,
    branchId: h.branchId,
    branchLabel: h.branch ? `${h.branch.name} (${h.branch.code})` : 'ทุกสาขา',
    createdAt: h.createdAt.toISOString(),
  }
}

export async function GET(req: NextRequest) {
  try {    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const branchFilter = searchParams.get('branchId')
    const year = searchParams.get('year')

    const isManager = canManageHolidays(session.user.role)

    const holidays = await prisma.companyHoliday.findMany({
      where: isManager
        ? branchFilter && branchFilter !== 'all'
          ? { OR: [{ branchId: null }, { branchId: branchFilter }] }
          : undefined
        : {
            OR: [
              { branchId: null },
              ...(session.user.branchId ? [{ branchId: session.user.branchId }] : []),
            ],
          },
      orderBy: [{ holidayDate: 'asc' }, { holidayName: 'asc' }],
      include: { branch: { select: { id: true, name: true, code: true } } },
    })

    let list = holidays
    if (year) {
      const y = parseInt(year, 10)
      if (!Number.isNaN(y)) {
        list = holidays.filter((h) => {
          if (h.repeatEveryYear) return true
          return h.holidayDate.getFullYear() === y
        })
      }
    }

    return NextResponse.json({ holidays: list.map(serialize) })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {    const session = await auth()
    if (!session?.user?.id || !canManageHolidays(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' },
        { status: 400 },
      )
    }

    const data = parsed.data
    const validated = validateHolidayInput({
      holidayName: data.holidayName,
      holidayDate: data.holidayDate,
      holidayType: data.holidayType,
      repeatEveryYear: data.repeatEveryYear,
    })
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const branchId =
      data.branchId === '' || data.branchId === 'all' ? null : data.branchId ?? null
    if (branchId) {
      const branch = await prisma.companyBranch.findUnique({ where: { id: branchId } })
      if (!branch) {
        return NextResponse.json({ error: 'ไม่พบสาขาที่เลือก' }, { status: 400 })
      }
    }

    const holiday = await prisma.companyHoliday.create({
      data: {
        holidayName: data.holidayName.trim(),
        holidayDate: validated.holidayDate,
        holidayType: data.holidayType,
        repeatEveryYear: data.repeatEveryYear ?? false,
        branchId,
        createdById: session.user.id,
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
    })

    return NextResponse.json({ holiday: serialize(holiday) })
  } catch (err) {
    return apiError(err)
  }
}
