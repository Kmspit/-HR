'use client'



import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

import { Loader2, FileBarChart, Users } from 'lucide-react'
import { TableSkeletonRows } from '@/components/ui/Skeleton'

import { toast } from 'sonner'

import { apiJson, apiErrorMessage } from '@/lib/client-api'



const MONTH_NAMES = [

  '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',

  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',

]



type EmployeeRow = {

  userId: string

  name: string

  employeeId: string | null

  department: string | null

  workDays: number

  lateDays: number

  lateMinutes: number

  earlyLeaveDays: number

  absentDays: number

  leaveByType: { label: string; days: number }[]

}



type ReportData = {

  month: number

  year: number

  employeeCount: number

  employees: EmployeeRow[]

}



type Props = { defaultMonth: number; defaultYear: number }



export default function ReportsClient({ defaultMonth, defaultYear }: Props) {
  const searchParams = useSearchParams()
  const branchId = searchParams.get('branchId')

  const [month, setMonth] = useState(defaultMonth)

  const [year, setYear] = useState(defaultYear)

  const [loading, setLoading] = useState(true)

  const [report, setReport] = useState<ReportData | null>(null)



  const load = useCallback(async () => {

    setLoading(true)

    const { ok, data, status } = await apiJson<ReportData>(

      `/api/reports/monthly?month=${month}&year=${year}${branchId && branchId !== 'all' ? `&branchId=${encodeURIComponent(branchId)}` : ''}`,

    )

    setLoading(false)

    if (!ok) {

      toast.error(apiErrorMessage(data as Record<string, unknown>, 'โหลดรายงานไม่สำเร็จ', status))

      setReport(null)

      return

    }

    setReport(data as ReportData)

  }, [month, year, branchId])



  useEffect(() => {

    load()

  }, [load])



  const employees = report?.employees ?? []



  return (

    <div className="p-5 space-y-5 max-w-6xl">

      <h1 className="text-lg font-bold text-white flex items-center gap-2">

        <FileBarChart className="w-5 h-5 text-blue-400" /> รายงานสรุปรายเดือน

      </h1>



      <div className="flex flex-wrap gap-3 items-end">

        <div>

          <label className="text-xs text-slate-400">เดือน</label>

          <select

            value={month}

            onChange={(e) => setMonth(Number(e.target.value))}

            className="block mt-1 rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-white text-sm"

          >

            {MONTH_NAMES.slice(1).map((name, i) => (

              <option key={i + 1} value={i + 1}>{name}</option>

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

          disabled={loading}

          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2 smooth-transition hover:bg-blue-500"

        >

          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}

          โหลดรายงาน

        </button>

      </div>



      {report && (

        <div className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">

          <Users className="w-4 h-4 flex-shrink-0" />

          <span>

            {MONTH_NAMES[month]} {year + 543} — พนักงาน <strong className="text-white">{report.employeeCount}</strong> คน

            (แสดงทุกคนที่สถานะใช้งาน)

          </span>

        </div>

      )}



      <div className="glass-card card-hover rounded-2xl overflow-hidden smooth-transition">

        <div className="table-scroll">

          <table className="w-full text-sm min-w-[720px]">

            <thead>

              <tr className="border-b border-white/10 bg-white/5">

                <th className="text-left p-3 text-slate-400 font-medium">พนักงาน</th>

                <th className="text-left p-3 text-slate-400 font-medium">แผนก</th>

                <th className="text-center p-3 text-slate-400 font-medium">วันทำงาน</th>

                <th className="text-center p-3 text-slate-400 font-medium">มาสาย</th>

                <th className="text-center p-3 text-slate-400 font-medium">กลับก่อน</th>

                <th className="text-center p-3 text-slate-400 font-medium">ขาด</th>

                <th className="text-left p-3 text-slate-400 font-medium">ลา</th>

              </tr>

            </thead>

            <tbody>

              {loading && <TableSkeletonRows rows={8} cols={7} />}

              {!loading && employees.length === 0 && (

                <tr>

                  <td colSpan={7} className="p-10 text-center text-slate-500">

                    ไม่พบพนักงานสถานะใช้งาน — ตรวจสอบเมนูจัดการพนักงาน

                  </td>

                </tr>

              )}

              {!loading &&

                employees.map((emp) => (

                  <tr

                    key={emp.userId}

                    className="table-row-hover"

                  >

                    <td className="p-3">

                      <p className="font-medium text-white">{emp.name}</p>

                      {emp.employeeId && (

                        <p className="text-[10px] text-slate-500">{emp.employeeId}</p>

                      )}

                    </td>

                    <td className="p-3 text-slate-400 text-xs">{emp.department ?? '—'}</td>

                    <td className="p-3 text-center font-semibold text-white tabular-nums">

                      {emp.workDays}

                    </td>

                    <td className="p-3 text-center text-yellow-400 tabular-nums">

                      {emp.lateDays > 0 ? `${emp.lateDays} (${emp.lateMinutes}น.)` : '—'}

                    </td>

                    <td className="p-3 text-center text-orange-400 tabular-nums">

                      {emp.earlyLeaveDays > 0 ? emp.earlyLeaveDays : '—'}

                    </td>

                    <td className="p-3 text-center text-red-400 tabular-nums">

                      {emp.absentDays > 0 ? emp.absentDays : '—'}

                    </td>

                    <td className="p-3">

                      {emp.leaveByType.length > 0 ? (

                        <div className="flex flex-wrap gap-1">

                          {emp.leaveByType.map((l) => (

                            <span

                              key={l.label}

                              className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-300"

                            >

                              {l.label} {l.days}ว.

                            </span>

                          ))}

                        </div>

                      ) : (

                        <span className="text-slate-600">—</span>

                      )}

                    </td>

                  </tr>

                ))}

            </tbody>

          </table>

        </div>

      </div>



      {!loading && employees.length > 0 && (

        <div className="space-y-3">

          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">รายละเอียดรายคน</p>

          {employees.map((emp) => (

            <div

              key={emp.userId}

              className="glass-card card-hover rounded-2xl p-4 space-y-2 smooth-transition"

            >

              <p className="font-semibold text-white">

                {emp.name}{' '}

                {emp.employeeId && (

                  <span className="text-slate-500 text-xs font-normal">({emp.employeeId})</span>

                )}

              </p>

              <p className="text-xs text-slate-400">{emp.department ?? '—'}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">

                <span className="text-slate-400">

                  วันทำงาน: <b className="text-white">{emp.workDays}</b>

                </span>

                <span className="text-slate-400">

                  มาสาย: <b className="text-yellow-400">{emp.lateDays}</b> ({emp.lateMinutes} น.)

                </span>

                <span className="text-slate-400">

                  กลับก่อน: <b className="text-orange-400">{emp.earlyLeaveDays}</b>

                </span>

                <span className="text-slate-400">

                  ขาด: <b className="text-red-400">{emp.absentDays}</b>

                </span>

              </div>

            </div>

          ))}

        </div>

      )}

    </div>

  )

}

