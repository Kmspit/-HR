import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    attendanceImportBatch: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn() },
    attendance: { findMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/attendance-work-log', () => ({
  getDayOfWeekIndex: vi.fn().mockReturnValue(1),
  finalizeAttendanceRecord: vi.fn().mockResolvedValue({ id: 'att-1' }),
}))
vi.mock('@/lib/notifications', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { finalizeAttendanceRecord } from '@/lib/attendance-work-log'
import { createAuditLog } from '@/lib/notifications'
import { POST } from '@/app/api/attendance/import/confirm/route'

const hrSession = { user: { id: 'hr-1', role: 'MANAGER_HR' } }
const employeeSession = { user: { id: 'emp-1', role: 'EMPLOYEE' } }

function computedRow(overrides: Record<string, unknown> = {}) {
  return {
    rowNumber: 2,
    userId: 'u1',
    employeeName: 'สมชาย ใจดี',
    date: '2026-09-22T17:00:00.000Z',
    checkIn: '2026-09-23T01:05:00.000Z',
    checkOut: '2026-09-23T10:30:00.000Z',
    lunchOut: null,
    lunchIn: null,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    workMinutes: 480,
    status: 'NORMAL',
    ...overrides,
  }
}

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/attendance/import/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/attendance/import/confirm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await POST(jsonRequest({}) as never)
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-HR_ADMIN role', async () => {
    vi.mocked(auth).mockResolvedValue(employeeSession as never)
    const res = await POST(jsonRequest({ fileName: 'x.xlsx', totalRows: 1, isLastChunk: true, rows: [computedRow()] }) as never)
    expect(res.status).toBe(403)
  })

  it('returns 400 for a malformed body (missing required fields)', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    const res = await POST(jsonRequest({ rows: [] }) as never)
    expect(res.status).toBe(400)
  })

  it('creates a new AttendanceImportBatch when no batchId is sent, and writes the chunk', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.attendanceImportBatch.create).mockResolvedValue(
      { id: 'batch-1', uploadedById: 'hr-1', skippedRows: '[]' } as never,
    )
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1' }] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])
    vi.mocked(prisma.attendance.create).mockResolvedValue({ id: 'att-1' } as never)
    vi.mocked(prisma.attendanceImportBatch.update).mockResolvedValue(
      { id: 'batch-1', createdCount: 1, skippedCount: 0 } as never,
    )

    const res = await POST(jsonRequest({
      fileName: 'x.xlsx', totalRows: 1, skippedRows: [], isLastChunk: true, rows: [computedRow()],
    }) as never)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.batchId).toBe('batch-1')
    expect(data.chunkCreated).toBe(1)
    expect(prisma.attendanceImportBatch.create).toHaveBeenCalledTimes(1)
    expect(prisma.attendance.create).toHaveBeenCalledTimes(1)
    expect(prisma.attendance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'u1', sessionIndex: 1, importBatchId: 'batch-1' }),
    }))
    expect(finalizeAttendanceRecord).toHaveBeenCalledWith('att-1')
  })

  it('appends to an existing batch when a batchId is sent, without creating a new one', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.attendanceImportBatch.findUnique).mockResolvedValue(
      { id: 'batch-1', uploadedById: 'hr-1', skippedRows: '[]' } as never,
    )
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1' }] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])
    vi.mocked(prisma.attendance.create).mockResolvedValue({ id: 'att-2' } as never)
    vi.mocked(prisma.attendanceImportBatch.update).mockResolvedValue(
      { id: 'batch-1', createdCount: 2, skippedCount: 0 } as never,
    )

    const res = await POST(jsonRequest({
      batchId: 'batch-1', fileName: 'x.xlsx', totalRows: 2, skippedRows: [], isLastChunk: true,
      rows: [computedRow({ rowNumber: 3 })],
    }) as never)

    expect(res.status).toBe(200)
    expect(prisma.attendanceImportBatch.create).not.toHaveBeenCalled()
    expect(prisma.attendanceImportBatch.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'batch-1' } }),
    )
  })

  it('returns 403 when the batchId belongs to a different uploader', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.attendanceImportBatch.findUnique).mockResolvedValue(
      { id: 'batch-1', uploadedById: 'someone-else', skippedRows: '[]' } as never,
    )

    const res = await POST(jsonRequest({
      batchId: 'batch-1', fileName: 'x.xlsx', totalRows: 1, isLastChunk: true, rows: [computedRow()],
    }) as never)
    expect(res.status).toBe(403)
  })

  it('returns 404 when the batchId does not exist', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.attendanceImportBatch.findUnique).mockResolvedValue(null as never)

    const res = await POST(jsonRequest({
      batchId: 'missing', fileName: 'x.xlsx', totalRows: 1, isLastChunk: true, rows: [computedRow()],
    }) as never)
    expect(res.status).toBe(404)
  })

  it('re-validates at write time: skips a row whose date now already has attendance (race condition), does not create it', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.attendanceImportBatch.create).mockResolvedValue(
      { id: 'batch-1', uploadedById: 'hr-1', skippedRows: '[]' } as never,
    )
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1' }] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      { userId: 'u1', date: new Date('2026-09-22T17:00:00.000Z') },
    ] as never)
    vi.mocked(prisma.attendanceImportBatch.update).mockResolvedValue(
      { id: 'batch-1', createdCount: 0, skippedCount: 1 } as never,
    )

    const res = await POST(jsonRequest({
      fileName: 'x.xlsx', totalRows: 1, skippedRows: [], isLastChunk: true, rows: [computedRow()],
    }) as never)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.chunkCreated).toBe(0)
    expect(data.chunkSkipped).toHaveLength(1)
    expect(prisma.attendance.create).not.toHaveBeenCalled()
  })

  it('treats a P2002 unique-constraint error from attendance.create as a skip, not a thrown failure', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.attendanceImportBatch.create).mockResolvedValue(
      { id: 'batch-1', uploadedById: 'hr-1', skippedRows: '[]' } as never,
    )
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1' }] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])
    const p2002 = Object.assign(new Error('unique constraint'), { code: 'P2002' })
    vi.mocked(prisma.attendance.create).mockRejectedValue(p2002)
    vi.mocked(prisma.attendanceImportBatch.update).mockResolvedValue(
      { id: 'batch-1', createdCount: 0, skippedCount: 1 } as never,
    )

    const res = await POST(jsonRequest({
      fileName: 'x.xlsx', totalRows: 1, skippedRows: [], isLastChunk: true, rows: [computedRow()],
    }) as never)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.chunkCreated).toBe(0)
    expect(data.chunkSkipped[0].reason).toContain('ซ้ำ')
  })

  it('does not write an AuditLog on an intermediate chunk (isLastChunk: false)', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.attendanceImportBatch.create).mockResolvedValue(
      { id: 'batch-1', uploadedById: 'hr-1', skippedRows: '[]' } as never,
    )
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1' }] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])
    vi.mocked(prisma.attendance.create).mockResolvedValue({ id: 'att-1' } as never)
    vi.mocked(prisma.attendanceImportBatch.update).mockResolvedValue(
      { id: 'batch-1', createdCount: 1, skippedCount: 0 } as never,
    )

    await POST(jsonRequest({
      fileName: 'x.xlsx', totalRows: 2, skippedRows: [], isLastChunk: false, rows: [computedRow()],
    }) as never)

    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('writes exactly one AuditLog on the final chunk (isLastChunk: true), summarizing the whole batch', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.attendanceImportBatch.findUnique).mockResolvedValue(
      { id: 'batch-1', uploadedById: 'hr-1', skippedRows: '[]' } as never,
    )
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1' }] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])
    vi.mocked(prisma.attendance.create).mockResolvedValue({ id: 'att-2' } as never)
    vi.mocked(prisma.attendanceImportBatch.update).mockResolvedValue(
      { id: 'batch-1', createdCount: 2, skippedCount: 0 } as never,
    )

    await POST(jsonRequest({
      batchId: 'batch-1', fileName: 'x.xlsx', totalRows: 2, skippedRows: [], isLastChunk: true,
      rows: [computedRow({ rowNumber: 3 })],
    }) as never)

    expect(createAuditLog).toHaveBeenCalledTimes(1)
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'hr-1', targetId: 'batch-1', targetType: 'AttendanceImportBatch', action: 'CREATE',
    }))
  })
})
