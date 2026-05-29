import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { ensureDbSchema } from '@/lib/ensure-db-schema'
import { buildMonthlyWorkLog } from '@/lib/attendance-work-log'
import {
  buildWorkLogCsv,
  buildWorkLogPdf,
  workLogExportFilename,
  type WorkLogExportMeta,
} from '@/lib/attendance-work-log-export'
import { branchUserWhere, buildBranchScope, parseBranchQueryParam } from '@/lib/branch-scope'

const MONTH_NAMES = [
  '',
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    await ensureDbSchema()
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1), 10)
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10)
    const userId = searchParams.get('userId') ?? session.user.id
    const format = (searchParams.get('format') ?? 'csv').toLowerCase()
    const branchParam = parseBranchQueryParam(searchParams.get('branchId') ?? undefined)

    if (userId !== session.user.id && !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (format !== 'csv' && format !== 'pdf') {
      return NextResponse.json({ error: 'format ต้องเป็น csv หรือ pdf' }, { status: 400 })
    }

    if (userId !== session.user.id) {
      const scope = buildBranchScope(session.user, { branchId: branchParam })
      const allowed = await prisma.user.findFirst({
        where: branchUserWhere(scope, { id: userId, status: 'ACTIVE' }),
        select: { id: true },
      })
      if (!allowed) {
        return NextResponse.json({ error: 'ไม่พบพนักงาน' }, { status: 404 })
      }
    }

    const [user, settings, report] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, employeeId: true, department: true },
      }),
      prisma.companySettings.findUnique({
        where: { id: 'singleton' },
        select: { companyName: true },
      }),
      buildMonthlyWorkLog(userId, month, year),
    ])

    if (!user) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
    }

    const meta: WorkLogExportMeta = {
      employeeName: user.name,
      employeeId: user.employeeId,
      department: user.department,
      month,
      year,
      monthLabel: MONTH_NAMES[month] ?? String(month),
      companyName: settings?.companyName ?? 'HRFlow',
    }

    const filename = workLogExportFilename(meta, format === 'pdf' ? 'pdf' : 'csv')

    if (format === 'pdf') {
      const buf = await buildWorkLogPdf(report.rows, meta)
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const buf = buildWorkLogCsv(report.rows, meta)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
