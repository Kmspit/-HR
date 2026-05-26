'use client'

import { useState } from 'react'
import { Loader2, FileBarChart } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

type Props = { defaultMonth: number; defaultYear: number }

export default function ReportsClient({ defaultMonth, defaultYear }: Props) {
  const [month, setMonth] = useState(defaultMonth)
  const [year, setYear] = useState(defaultYear)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<{
    employees: Array<{
      name: string
      employeeId: string | null
      department: string | null
      workDays: number
      lateDays: number
      lateMinutes: number
      earlyLeaveDays: number
      absentDays: number
      leaveByType: { label: string; days: number }[]
    }>
  } | null>(null)

  const load = async () => {
    setLoading(true)
    const { ok, data, status } = await apiJson<typeof report & { month: number; year: number }>(
      `/api/reports/monthly?month=${month}&year=${year}`,
    )
    setLoading(false)
    if (!ok) {
      toast.error(apiErrorMessage(data as Record<string, unknown>, 'โหลดรายงานไม่สำเร็จ', status))
      return
    }
    setReport(data as typeof report)
  }

  return (
    <div className="p-5 space-y-5 max-w-4xl">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <FileBarChart className="w-5 h-5 text-blue-400" /> รายงานสรุปรายเดือน (อัตโนมัติ)
      </h1>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-slate-400">เดือน</label>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="block mt-1 rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-white text-sm">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400">ปี</label>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="block mt-1 w-24 rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-white text-sm" />
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'สร้างรายงาน'}
        </button>
      </div>

      {report?.employees?.map((emp) => (
        <div key={emp.name} className="rounded-2xl border border-white/10 bg-slate-900 p-4 space-y-2">
          <p className="font-semibold text-white">{emp.name} {emp.employeeId && <span className="text-slate-500 text-xs">({emp.employeeId})</span>}</p>
          <p className="text-xs text-slate-400">{emp.department ?? '—'}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <span className="text-slate-400">วันทำงาน: <b className="text-white">{emp.workDays}</b></span>
            <span className="text-slate-400">มาสาย: <b className="text-yellow-400">{emp.lateDays}</b> ({emp.lateMinutes} น.)</span>
            <span className="text-slate-400">กลับก่อน: <b className="text-orange-400">{emp.earlyLeaveDays}</b></span>
            <span className="text-slate-400">ขาด: <b className="text-red-400">{emp.absentDays}</b></span>
          </div>
          {emp.leaveByType.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {emp.leaveByType.map((l) => (
                <span key={l.label} className="rounded-lg bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">{l.label}: {l.days} วัน</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
