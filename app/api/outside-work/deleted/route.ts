import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { HR_STAFF_ROLES } from '@/lib/access-control'
import type { Role, Prisma } from '@prisma/client'

/** ดูรายการ "ออกนอกสถานที่" ที่ถูก soft-delete ไปแล้ว — จำกัดเฉพาะ role ที่ไว้ใจได้ */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!HR_STAFF_ROLES.includes(session.user.role as Role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to   = searchParams.get('to')

    const deletedAtFilter: Prisma.DateTimeFilter = {}
    if (from) deletedAtFilter.gte = new Date(from)
    if (to)   deletedAtFilter.lte = new Date(to)

    const rows = await prisma.outsideWorkRequest.findMany({
      where: {
        deletedAt: Object.keys(deletedAtFilter).length ? deletedAtFilter : { not: null },
      },
      select: {
        id: true, date: true, place: true, purpose: true, documentNumber: true,
        deletedAt: true,
        clientCompany: { select: { companyName: true } },
        user: { select: { name: true } },
        deletedBy: { select: { name: true } },
      },
      orderBy: { deletedAt: 'desc' },
      take: 200,
    })

    return NextResponse.json({ items: rows })
  } catch (err) {
    return apiError(err)
  }
}
