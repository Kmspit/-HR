import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { HR_ADMIN } from '@/lib/module-gates'
import { parseAttendanceImportWorkbook } from '@/lib/attendance-import-parse'
import { validateAndComputeAttendanceImportRows } from '@/lib/attendance-import-validate'
import type { Role } from '@prisma/client'

const ALLOWED_ROLES: Role[] = HR_ADMIN

// Excel parse + up to 2,000 rows of DB-batched validation can run long —
// this route has its own serverless function bundle (Next.js App Router
// convention, one bundle per route.ts), so this only widens THIS endpoint's
// timeout, not every route in the app.
export const maxDuration = 60

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB — approved limit (2026-09-22 plan)
const MAX_ROWS = 2000 // approved limit — larger files must be split by HR
const ALLOWED_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
]

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ALLOWED_ROLES.includes(session.user.role as Role)) {
      return NextResponse.json({ error: 'เฉพาะ HR หรือ Admin เท่านั้นที่นำเข้าข้อมูลลงเวลาได้', code: 'FORBIDDEN' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์ที่อัปโหลด' }, { status: 400 })
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${MAX_FILE_SIZE / 1024 / 1024}MB — กรุณาแบ่งไฟล์` }, { status: 400 })
    }
    if (file.type && !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'รองรับเฉพาะไฟล์ .xlsx เท่านั้น' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const parsed = await parseAttendanceImportWorkbook(buffer)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.headerError }, { status: 400 })
    }
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: 'ไม่พบแถวข้อมูลในไฟล์' }, { status: 400 })
    }
    if (parsed.rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `ไฟล์นี้มี ${parsed.rows.length} แถว เกินขีดจำกัด ${MAX_ROWS} แถวต่อครั้ง — กรุณาแบ่งไฟล์แล้วอัปโหลดหลายรอบ` },
        { status: 400 },
      )
    }

    const result = await validateAndComputeAttendanceImportRows(parsed.rows)

    return NextResponse.json({
      fileName: file.name,
      totalRows: result.totalRows,
      toCreate: result.toCreate.map((r) => ({
        rowNumber: r.rowNumber,
        userId: r.userId,
        employeeName: r.employeeName,
        date: r.date.toISOString(),
        checkIn: r.checkIn?.toISOString() ?? null,
        checkOut: r.checkOut?.toISOString() ?? null,
        lunchOut: r.lunchOut?.toISOString() ?? null,
        lunchIn: r.lunchIn?.toISOString() ?? null,
        lateMinutes: r.lateMinutes,
        earlyLeaveMinutes: r.earlyLeaveMinutes,
        workMinutes: r.workMinutes,
        status: r.status,
      })),
      skipped: result.skipped,
      estimatedDeductionByEmployee: result.estimatedDeductionByEmployee,
      totalEstimatedDeduction: result.totalEstimatedDeduction,
    })
  } catch (err) {
    return apiError(err)
  }
}
