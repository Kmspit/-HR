import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { buildMonthlyWorkLog, buildMonthlyWorkLogForTeam } from '@/lib/attendance-work-log'
import {
  buildWorkLogCsv,
  buildWorkLogPdf,
  buildWorkLogXlsx,
  type WorkLogExportMeta,
} from '@/lib/attendance-work-log-export'
import {
  contentDispositionAttachment,
  workLogExportFilename,
} from '@/lib/export-download'
import { branchUserWhere, buildBranchScope, parseBranchQueryParam } from '@/lib/branch-scope'
import {
  ALL_EMPLOYEES_USER_ID,
  listAttendanceTeamUsers,
} from '@/lib/attendance-team-users'
import { getCachedCompanySettings } from '@/lib/company-settings-cache'
import { canListCompanyWideRecords, canViewUserRecord } from '@/lib/org-scope'

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

    if (userId !== session.user.id && userId !== ALL_EMPLOYEES_USER_ID) {
      const allowed = await canViewUserRecord(
        prisma,
        session.user.id,
        session.user.role,
        session.user.branchId,
        userId,
      )
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (format !== 'csv' && format !== 'pdf' && format !== 'xlsx') {
      return NextResponse.json({ error: 'format ต้องเป็น xlsx, csv หรือ pdf' }, { status: 400 })
    }

    const scope = buildBranchScope(session.user, { branchId: branchParam })
    const settings = await getCachedCompanySettings()

    let meta: WorkLogExportMeta
    let rows: Awaited<ReturnType<typeof buildMonthlyWorkLog>>['rows']
    let includeEmployeeColumn = false

    if (userId === ALL_EMPLOYEES_USER_ID) {
      if (!canListCompanyWideRecords(session.user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const team = await listAttendanceTeamUsers(scope)
      const report = await buildMonthlyWorkLogForTeam(team, month, year)
      rows = report.rows
      includeEmployeeColumn = true
      meta = {
        employeeName: `ทุกคน (${team.length} คน)`,
        employeeId: null,
        department: null,
        month,
        year,
        monthLabel: MONTH_NAMES[month] ?? String(month),
        companyName: settings?.companyName ?? 'HRFlow',
      }
    } else {
      if (userId !== session.user.id) {
        const allowed = await prisma.user.findFirst({
          where: branchUserWhere(scope, { id: userId }),
          select: { id: true },
        })
        if (!allowed) {
          return NextResponse.json({ error: 'ไม่พบพนักงาน' }, { status: 404 })
        }
      }

      const [user, report] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, employeeId: true, department: true },
        }),
        buildMonthlyWorkLog(userId, month, year),
      ])

      if (!user) {
        return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
      }

      rows = report.rows
      meta = {
        employeeName: user.name,
        employeeId: user.employeeId,
        department: user.department,
        month,
        year,
        monthLabel: MONTH_NAMES[month] ?? String(month),
        companyName: settings?.companyName ?? 'HRFlow',
      }
    }

    if (format === 'pdf') {
      const buf = await buildWorkLogPdf(rows, meta, { includeEmployeeColumn })
      const filename = workLogExportFilename(meta, 'pdf')
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': contentDispositionAttachment(filename),
          'Content-Length': String(buf.length),
          'Cache-Control': 'no-store',
        },
      })
    }

    if (format === 'xlsx') {
      const buf = await buildWorkLogXlsx(rows, meta, { includeEmployeeColumn })
      const filename = workLogExportFilename(meta, 'xlsx')
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': contentDispositionAttachment(filename),
          'Cache-Control': 'no-store',
        },
      })
    }

    const buf = buildWorkLogCsv(rows, meta, { includeEmployeeColumn })
    const filename = workLogExportFilename(meta, 'csv')
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': contentDispositionAttachment(filename),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
