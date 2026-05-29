'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ClipboardList, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { TableSkeletonRows } from '@/components/ui/Skeleton'
import type { Role } from '@prisma/client'

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

type WorkLogRow = {
  id: string
  dateLabel: string
  dayLabel: string
  checkInTime: string
  checkInPlace: string | null
  lunchOutTime: string
  lunchInTime: string
  checkOutTime: string
  checkOutPlace: string | null
  lateMinutes: number
  earlyLeaveMinutes: number
  workHoursLabel: string
  statusDisplay: string
  leaveTypeLabel: string | null
  note: string | null
}

type ReportPayload = {
  month: number
  year: number
  rows: WorkLogRow[]
  summary: {
    present: number
    late: number
    leave: number
    absent: number
    halfDay: number
    earlyLeave: number
    totalWorkMinutes: number
    totalLateMinutes: number
    totalEarlyMinutes: number
  }
  employee: { name: string; employeeId: string | null; department: string | null }
}

type Props = {
  role: Role
  defaultUserId: string
  selfUserId: string
  defaultMonth: number
  defaultYear: number
  employees: { id: string; name: string; employeeId: string | null }[]
  canPickEmployee: boolean
}

const STATUS_COLORS: Record<string, string> = {
  Present: 'text-green-400',
  Late: 'text-amber-400',
  Leave: 'text-blue-400',
  Absent: 'text-red-400',
  'Half Day': 'text-purple-400',
  'Early Leave': 'text-orange-400',
  OT: 'text-cyan-400',
}

export default function MonthlyAttendanceClient({
  defaultUserId,
  defaultMonth,
  defaultYear,
  employees,
  canPickEmployee,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const branchId = searchParams.get('branchId')

  const [month, setMonth] = useState(defaultMonth)
  const [year, setYear] = useState(defaultYear)
  const [userId, setUserId] = useState(defaultUserId)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)
  const [report, setReport] = useState<ReportPayload | null>(null)

  const exportQuery = () => {
    const q = new URLSearchParams({
      month: String(month),
      year: String(year),
      userId,
    })
    if (branchId && branchId !== 'all') q.set('branchId', branchId)
    return q
  }

  const downloadExport = async (format: 'csv' | 'pdf') => {
    setExporting(format)
    try {
      const q = exportQuery()
      q.set('format', format)
      const res = await fetch(`/api/attendance/work-log/export?${q.toString()}`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(err.error ?? 'ส่งออกไม่สำเร็จ')
        return
      }
      const blob = await res.blob()
      const disp = res.headers.get('Content-Disposition') ?? ''
      const match = /filename="([^"]+)"/.exec(disp)
      const filename = match?.[1] ?? `attendance-${year}-${month}.${format === 'pdf' ? 'pdf' : 'csv'}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(format === 'pdf' ? 'ดาวน์โหลด PDF แล้ว' : 'ดาวน์โหลด Excel (CSV) แล้ว')
    } catch {
      toast.error('ส่งออกไม่สำเร็จ')
    } finally {
      setExporting(null)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const q = new URLSearchParams({
      month: String(month),
      year: String(year),
      userId,
    })
    if (branchId && branchId !== 'all') q.set('branchId', branchId)

    const { ok, data, status } = await apiJson<ReportPayload>(
      `/api/attendance/work-log?${q.toString()}`,
    )
    setLoading(false)
    if (!ok) {
      toast.error(apiErrorMessage(data as Record<string, unknown>, 'โหลดบันทึกลงเวลาไม่สำเร็จ', status))
      setReport(null)
      return
    }
    setReport(data as ReportPayload)
  }, [month, year, userId, branchId])

  useEffect(() => {
    load()
  }, [load])

  const onEmployeeChange = (id: string) => {
    setUserId(id)
    const params = new URLSearchParams(searchParams.toString())
    params.set('userId', id)
    router.replace(`/attendance/monthly?${params.toString()}`)
  }

  const rows = report?.rows ?? []
  const summary = report?.summary

  return (
    <div className="p-5 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-cyan-400" />
          แบบฟอร์มบันทึกลงเวลาทำงาน (รายเดือน)
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          บันทึกอัตโนมัติจากเช็คอิน/พัก/เช็คเอาท์ และลาอนุมัติ — รองรับคำนวณเงินเดือน
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        {canPickEmployee && employees.length > 0 && (
          <div className="min-w-[200px]">
            <label className="text-xs text-slate-400">พนักงาน</label>
            <select
              value={userId}
              onChange={(e) => onEmployeeChange(e.target.value)}
              className="block mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-white text-sm"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.employeeId ? ` (${e.employeeId})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-slate-400">เดือน</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="block mt-1 rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-white text-sm"
          >
            {MONTH_NAMES.slice(1).map((name, i) => (
              <option key={i + 1} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400">ปี</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="block mt-1 w-28 rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-white text-sm"
          />
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm text-white"
        >
          โหลดใหม่
        </button>
        <button
          type="button"
          disabled={loading || exporting !== null || !report?.rows.length}
          onClick={() => downloadExport('csv')}
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2 text-sm text-emerald-300 flex items-center gap-2 disabled:opacity-40"
        >
          {exporting === 'csv' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="w-4 h-4" />
          )}
          Excel
        </button>
        <button
          type="button"
          disabled={loading || exporting !== null || !report?.rows.length}
          onClick={() => downloadExport('pdf')}
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2 text-sm text-rose-300 flex items-center gap-2 disabled:opacity-40"
        >
          {exporting === 'pdf' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          PDF
        </button>
      </div>

      {report?.employee && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
          <span className="text-white font-medium">{report.employee.name}</span>
          {report.employee.employeeId && (
            <span className="ml-2 text-slate-500">รหัส {report.employee.employeeId}</span>
          )}
          {report.employee.department && (
            <span className="ml-2 text-slate-500">{report.employee.department}</span>
          )}
          <span className="ml-3 text-slate-500">
            {MONTH_NAMES[month]} {year}
          </span>
        </div>
      )}

      {summary && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { label: 'มาทำงาน', value: summary.present, color: 'text-green-400' },
            { label: 'มาสาย', value: summary.late, color: 'text-amber-400' },
            { label: 'ลา', value: summary.leave, color: 'text-blue-400' },
            { label: 'ขาด', value: summary.absent, color: 'text-red-400' },
            { label: 'ครึ่งวัน', value: summary.halfDay, color: 'text-purple-400' },
            { label: 'กลับก่อน', value: summary.earlyLeave, color: 'text-orange-400' },
            {
              label: 'ชม.รวม',
              value: `${Math.floor(summary.totalWorkMinutes / 60)}:${String(summary.totalWorkMinutes % 60).padStart(2, '0')}`,
              color: 'text-cyan-400',
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-center"
            >
              <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-slate-500 uppercase">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-xs text-left min-w-[1100px]">
          <thead className="bg-slate-900/80 text-slate-400 sticky top-0">
            <tr>
              <th className="px-2 py-2">วันที่</th>
              <th className="px-2 py-2">วัน</th>
              <th className="px-2 py-2">เช็คอิน</th>
              <th className="px-2 py-2">สถานที่เข้า</th>
              <th className="px-2 py-2">เริ่มพัก</th>
              <th className="px-2 py-2">จบพัก</th>
              <th className="px-2 py-2">เช็คเอาท์</th>
              <th className="px-2 py-2">สถานที่ออก</th>
              <th className="px-2 py-2">มาสาย (น.)</th>
              <th className="px-2 py-2">กลับก่อน (น.)</th>
              <th className="px-2 py-2">ชม.ทำงาน</th>
              <th className="px-2 py-2">สถานะ</th>
              <th className="px-2 py-2">ประเภทลา</th>
              <th className="px-2 py-2">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && <TableSkeletonRows cols={14} rows={8} />}
            {!loading &&
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/5 text-slate-300">
                  <td className="px-2 py-2 whitespace-nowrap">{r.dateLabel}</td>
                  <td className="px-2 py-2">{r.dayLabel}</td>
                  <td className="px-2 py-2">{r.checkInTime}</td>
                  <td className="px-2 py-2 max-w-[120px] truncate" title={r.checkInPlace ?? ''}>
                    {r.checkInPlace ?? '—'}
                  </td>
                  <td className="px-2 py-2">{r.lunchOutTime}</td>
                  <td className="px-2 py-2">{r.lunchInTime}</td>
                  <td className="px-2 py-2">{r.checkOutTime}</td>
                  <td className="px-2 py-2 max-w-[120px] truncate" title={r.checkOutPlace ?? ''}>
                    {r.checkOutPlace ?? '—'}
                  </td>
                  <td className="px-2 py-2 text-amber-400">{r.lateMinutes > 0 ? r.lateMinutes : '—'}</td>
                  <td className="px-2 py-2 text-orange-400">
                    {r.earlyLeaveMinutes > 0 ? r.earlyLeaveMinutes : '—'}
                  </td>
                  <td className="px-2 py-2">{r.workHoursLabel}</td>
                  <td
                    className={`px-2 py-2 font-medium ${STATUS_COLORS[r.statusDisplay] ?? 'text-slate-400'}`}
                  >
                    {r.statusDisplay}
                  </td>
                  <td className="px-2 py-2 max-w-[100px] truncate">{r.leaveTypeLabel ?? '—'}</td>
                  <td className="px-2 py-2 max-w-[80px] truncate">{r.note ?? '—'}</td>
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-slate-500">
                  ไม่มีข้อมูลในเดือนนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
