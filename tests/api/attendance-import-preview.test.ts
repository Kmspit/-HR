import { describe, it, expect, vi, beforeEach } from 'vitest'
import ExcelJS from 'exceljs'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    attendance: { findMany: vi.fn() },
    companyHoliday: { findMany: vi.fn().mockResolvedValue([]) },
    leaveRequest: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))
vi.mock('@/lib/company-settings-cache', () => ({
  getCachedCompanySettings: vi.fn().mockResolvedValue({ workStartTime: '08:30', lateGraceMin: 5, workEndTime: '17:00' }),
}))
vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/attendance/import/preview/route'

const hrSession = { user: { id: 'hr-1', role: 'MANAGER_HR' } }
const employeeSession = { user: { id: 'emp-1', role: 'EMPLOYEE' } }

async function buildXlsx(rows: string[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('Sheet1')
  sheet.addRow(['พนักงาน', 'วันที่', 'วัน', 'เช็คอิน', 'สถานที่เช็คอิน', 'เริ่มพัก', 'จบพัก', 'เช็คเอาท์', 'สถานที่เช็คเอาท์', 'มาสาย (นาที)', 'กลับก่อน (นาที)', 'ชั่วโมงทำงาน', 'สถานะ', 'ประเภทการลา', 'หมายเหตุ'])
  for (const r of rows) sheet.addRow(r)
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

function makeFileRequest(buf: ArrayBuffer, opts: { name?: string; type?: string } = {}) {
  const fd = new FormData()
  const file = new File([buf], opts.name ?? 'import.xlsx', {
    type: opts.type ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  fd.append('file', file)
  return new Request('http://localhost/api/attendance/import/preview', { method: 'POST', body: fd })
}

describe('POST /api/attendance/import/preview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const buf = await buildXlsx([])
    const res = await POST(makeFileRequest(buf) as never)
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-HR_ADMIN role (e.g. plain EMPLOYEE)', async () => {
    vi.mocked(auth).mockResolvedValue(employeeSession as never)
    const buf = await buildXlsx([['สมชาย ใจดี (E001)', '23/09/2026', '-', '08:05', '-', '-', '-', '17:30', '-', '-', '-', '-', '-', '-', '-']])
    const res = await POST(makeFileRequest(buf) as never)
    expect(res.status).toBe(403)
  })

  it('returns 400 when no file is attached', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    const fd = new FormData()
    const res = await POST(new Request('http://localhost/x', { method: 'POST', body: fd }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when the file exceeds the 2MB limit', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    const bigBuf = new ArrayBuffer(2 * 1024 * 1024 + 1)
    const res = await POST(makeFileRequest(bigBuf) as never)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('2MB')
  })

  it('returns 400 with the header error when a required column is missing', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    const wb = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet('Sheet1')
    sheet.addRow(['พนักงาน', 'วันที่']) // missing most required columns
    sheet.addRow(['สมชาย ใจดี (E001)', '23/09/2026'])
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer

    const res = await POST(makeFileRequest(buf) as never)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('เช็คอิน')
  })

  it('returns the computed preview (toCreate/skipped/estimated deduction) for a valid file', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', employeeId: 'E001', name: 'สมชาย ใจดี', baseSalary: 30000, branchId: 'b1' },
    ] as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])

    const buf = await buildXlsx([
      ['สมชาย ใจดี (E001)', '23/09/2026', '-', '08:05', '-', '-', '-', '17:30', '-', '-', '-', '-', '-', '-', '-'],
    ])
    const res = await POST(makeFileRequest(buf) as never)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.toCreate).toHaveLength(1)
    expect(data.toCreate[0].userId).toBe('u1')
    expect(data.toCreate[0].status).toBe('NORMAL')
    expect(data.skipped).toHaveLength(0)
    expect(data.fileName).toBe('import.xlsx')
  })

  it('returns 400 with a clear row-count message when the file exceeds 2,000 rows', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    const rows = Array.from({ length: 2001 }, () => ['สมชาย ใจดี (E001)', '23/09/2026', '-', '08:05', '-', '-', '-', '17:30', '-', '-', '-', '-', '-', '-', '-'])
    const buf = await buildXlsx(rows)
    const res = await POST(makeFileRequest(buf) as never)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('2000')
  })
})
