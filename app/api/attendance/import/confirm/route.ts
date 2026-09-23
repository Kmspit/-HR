import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { HR_ADMIN } from '@/lib/module-gates'
import { ATTENDANCE_COMPLETED_PATCH } from '@/lib/attendance-flow'
import { getDayOfWeekIndex, finalizeAttendanceRecord } from '@/lib/attendance-work-log'
import { bangkokDateKey } from '@/lib/datetime-bangkok'
import { createAuditLog } from '@/lib/notifications'
import type { AttendanceStatus, Role } from '@prisma/client'

const ALLOWED_ROLES: Role[] = HR_ADMIN

// Same reasoning as the preview route — up to 200 attendance.create() +
// finalizeAttendanceRecord() pairs per chunk, this route's own serverless
// bundle needs the headroom.
export const maxDuration = 60

/** Bounded concurrency for the create+finalize writes below — same cap and
 *  same reasoning as ATTENDANCE_FINALIZE_WRITE_CONCURRENCY in
 *  lib/attendance-work-log.ts (that constant isn't exported, so this is a
 *  deliberate small duplicate rather than a new shared export for one use). */
const WRITE_CONCURRENCY = 20

const ATTENDANCE_STATUS_VALUES = ['NORMAL', 'LATE', 'LEAVE', 'ABSENT', 'HALF_DAY', 'EARLY_LEAVE', 'OT'] as const

const skippedRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  employeeCell: z.string(),
  reason: z.string(),
})

const computedRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  userId: z.string().min(1),
  employeeName: z.string(),
  date: z.string(),
  checkIn: z.string().nullable(),
  checkOut: z.string().nullable(),
  lunchOut: z.string().nullable(),
  lunchIn: z.string().nullable(),
  lateMinutes: z.number().int().min(0),
  earlyLeaveMinutes: z.number().int().min(0),
  workMinutes: z.number().int().min(0),
  status: z.enum(ATTENDANCE_STATUS_VALUES),
})

const confirmBodySchema = z.object({
  /** Absent on the first chunk (server creates the AttendanceImportBatch and
   *  returns its id); every subsequent chunk for the same upload sends it
   *  back so all chunks accumulate onto the same batch row. */
  batchId: z.string().optional(),
  fileName: z.string().min(1),
  totalRows: z.number().int().positive(),
  /** The FULL skip list from the preview step — only meaningful (and only
   *  used) on the first chunk (no batchId yet); ignored on later chunks
   *  since it's already been persisted onto the batch row by then. */
  skippedRows: z.array(skippedRowSchema).default([]),
  isLastChunk: z.boolean(),
  /** One chunk's worth of already-computed rows (≤200, the approved
   *  per-request batch size) — never the raw file, never re-parsed here. */
  rows: z.array(computedRowSchema).min(1).max(200),
})

type SkippedRow = z.infer<typeof skippedRowSchema>

function requestIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ALLOWED_ROLES.includes(session.user.role as Role)) {
      return NextResponse.json({ error: 'เฉพาะ HR หรือ Admin เท่านั้นที่นำเข้าข้อมูลลงเวลาได้', code: 'FORBIDDEN' }, { status: 403 })
    }

    const parsedBody = confirmBodySchema.safeParse(await req.json().catch(() => null))
    if (!parsedBody.success) {
      return NextResponse.json({ error: parsedBody.error.errors[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }
    const { batchId: incomingBatchId, fileName, totalRows, skippedRows, isLastChunk, rows } = parsedBody.data

    let batch: { id: string; uploadedById: string; skippedRows: string | null }
    if (incomingBatchId) {
      const existing = await prisma.attendanceImportBatch.findUnique({
        where: { id: incomingBatchId },
        select: { id: true, uploadedById: true, skippedRows: true },
      })
      if (!existing) return NextResponse.json({ error: 'ไม่พบ batch การนำเข้านี้' }, { status: 404 })
      // Scoped to the same uploader — role gate alone (any HR_ADMIN) would
      // otherwise let a different HR account append rows onto someone
      // else's in-progress import via a guessed/leaked batchId.
      if (existing.uploadedById !== session.user.id) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง batch การนำเข้านี้' }, { status: 403 })
      }
      batch = existing
    } else {
      batch = await prisma.attendanceImportBatch.create({
        data: {
          uploadedById: session.user.id,
          fileName,
          totalRows,
          createdCount: 0,
          skippedCount: 0,
          skippedRows: '[]',
        },
        select: { id: true, uploadedById: true, skippedRows: true },
      })
    }

    // Re-validate right before writing (defense in depth — the preview ran
    // earlier and this is a fresh request; another chunk or an unrelated
    // change could have altered things in between). Batched, not per-row.
    const userIds = [...new Set(rows.map((r) => r.userId))]
    const [existingUsers, existingAttendance] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } }),
      prisma.attendance.findMany({ where: { userId: { in: userIds } }, select: { userId: true, date: true } }),
    ])
    const validUserIds = new Set(existingUsers.map((u) => u.id))
    const claimedKeys = new Set(existingAttendance.map((e) => `${e.userId}|${bangkokDateKey(e.date)}`))

    const chunkSkipped: SkippedRow[] = []
    const toWrite: typeof rows = []
    for (const row of rows) {
      if (!validUserIds.has(row.userId)) {
        chunkSkipped.push({ rowNumber: row.rowNumber, employeeCell: row.employeeName, reason: 'ไม่พบพนักงานคนนี้แล้ว (อาจถูกลบระหว่างประมวลผล) — ข้ามแถวนี้' })
        continue
      }
      const key = `${row.userId}|${bangkokDateKey(new Date(row.date))}`
      if (claimedKeys.has(key)) {
        chunkSkipped.push({ rowNumber: row.rowNumber, employeeCell: row.employeeName, reason: 'มีข้อมูลลงเวลาของวันนี้อยู่แล้ว (อาจถูกสร้างระหว่างประมวลผล) — ข้ามแถวนี้' })
        continue
      }
      claimedKeys.add(key)
      toWrite.push(row)
    }

    let created = 0
    for (let i = 0; i < toWrite.length; i += WRITE_CONCURRENCY) {
      const slice = toWrite.slice(i, i + WRITE_CONCURRENCY)
      const results = await Promise.all(
        slice.map(async (row) => {
          try {
            const date = new Date(row.date)
            const attendance = await prisma.attendance.create({
              data: {
                ...ATTENDANCE_COMPLETED_PATCH,
                userId: row.userId,
                date,
                sessionIndex: 1,
                checkIn: row.checkIn ? new Date(row.checkIn) : null,
                checkOut: row.checkOut ? new Date(row.checkOut) : null,
                lunchOut: row.lunchOut ? new Date(row.lunchOut) : null,
                lunchIn: row.lunchIn ? new Date(row.lunchIn) : null,
                lateMinutes: row.lateMinutes,
                earlyLeaveMinutes: row.earlyLeaveMinutes,
                workMinutes: row.workMinutes,
                status: row.status as AttendanceStatus,
                dayOfWeek: getDayOfWeekIndex(date),
                importBatchId: batch.id,
              },
              select: { id: true },
            })
            await finalizeAttendanceRecord(attendance.id)
            return { ok: true as const }
          } catch (err) {
            const code = (err as { code?: string })?.code
            const reason = code === 'P2002'
              ? 'ข้อมูลซ้ำกับที่มีอยู่แล้ว (ชนกันตอนเขียนจริง) — ข้ามแถวนี้'
              : 'เขียนข้อมูลไม่สำเร็จ — ข้ามแถวนี้'
            return { ok: false as const, row, reason }
          }
        }),
      )
      for (const r of results) {
        if (r.ok) created++
        else chunkSkipped.push({ rowNumber: r.row.rowNumber, employeeCell: r.row.employeeName, reason: r.reason })
      }
    }

    const priorSkipped = JSON.parse(batch.skippedRows || '[]') as SkippedRow[]
    // The client's full preview-time skip list is only meaningful (and only
    // sent meaningfully) on the very first chunk — later chunks would
    // otherwise re-append the same list every time.
    const newlyKnownSkipped = incomingBatchId ? chunkSkipped : [...skippedRows, ...chunkSkipped]
    const mergedSkipped = [...priorSkipped, ...newlyKnownSkipped]

    const updatedBatch = await prisma.attendanceImportBatch.update({
      where: { id: batch.id },
      data: {
        createdCount: { increment: created },
        skippedCount: mergedSkipped.length,
        skippedRows: JSON.stringify(mergedSkipped),
      },
      select: { id: true, createdCount: true, skippedCount: true },
    })

    if (isLastChunk) {
      await createAuditLog({
        actorId: session.user.id,
        targetId: batch.id,
        targetType: 'AttendanceImportBatch',
        action: 'CREATE',
        after: { fileName, totalRows, createdCount: updatedBatch.createdCount, skippedCount: updatedBatch.skippedCount },
        ip: requestIp(req),
        userAgent: req.headers.get('user-agent') ?? undefined,
      })
    }

    return NextResponse.json({
      batchId: batch.id,
      chunkCreated: created,
      chunkSkipped,
      totalCreatedSoFar: updatedBatch.createdCount,
      totalSkippedSoFar: updatedBatch.skippedCount,
    })
  } catch (err) {
    return apiError(err)
  }
}
