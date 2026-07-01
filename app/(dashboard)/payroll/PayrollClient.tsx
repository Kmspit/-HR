'use client'

import { useState } from 'react'
import { DollarSign, Download, Loader2, RefreshCw, Clock, X } from 'lucide-react'
import { TableSkeletonRows } from '@/components/ui/Skeleton'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import LateDeductionDetail from '@/components/payroll/LateDeductionDetail'
import { ManualButton } from '@/components/ui/ManualButton'

type PayrollRow = {
  id: string
  userId: string
  name: string
  employeeId: string
  department: string
  position: string
  socialSecurity: boolean
  baseSalary: number
  lateDeduction: number
  absentDeduction: number
  unpaidLeave: number
  ssDeduction: number
  netSalary: number
  lateDays: number
  absentDays: number
  lateMinutes: number
  lateBillableMinutes?: number
  lateDeductionDetail?: string | null
  status: string
  hasPayroll?: boolean
}

type LateSummary = {
  employeesWithLate: number
  totalLateDeduction: number
  totalBillableLateMinutes: number
}

type Props = {
  month: number
  year: number
  payrolls: PayrollRow[]
  totalEmployees?: number
  filterBranchId?: string
}

const MONTH_NAMES = [
  '',
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
]

export default function PayrollClient({
  month: initMonth,
  year: initYear,
  payrolls: initPayrolls,
  totalEmployees,
  filterBranchId,
}: Props) {
  const [month, setMonth] = useState(initMonth)
  const [year, setYear] = useState(initYear)
  const [payrolls, setPayrolls] = useState(initPayrolls)
  const [lateSummary, setLateSummary] = useState<LateSummary | null>(null)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [detailRow, setDetailRow] = useState<PayrollRow | null>(null)

  const loadPayrolls = async (m: number, y: number) => {
    setLoading(true)
    const { ok, data } = await apiJson<{
      payrolls?: PayrollRow[]
      employeeCount?: number
      lateSummary?: LateSummary
    }>(
      `/api/payroll/report?month=${m}&year=${y}${filterBranchId ? `&branchId=${encodeURIComponent(filterBranchId)}` : ''}`,
    )
    if (ok && data.payrolls) {
      setPayrolls(
        data.payrolls.map((p) => ({
          ...p,
          name: (p as { user?: { name?: string } }).user?.name ?? p.name ?? '',
          employeeId: (p as { user?: { employeeId?: string } }).user?.employeeId ?? p.employeeId ?? '',
          department: (p as { user?: { department?: string } }).user?.department ?? p.department ?? '',
          position: (p as { user?: { position?: string } }).user?.position ?? p.position ?? '',
          socialSecurity:
            (p as { user?: { socialSecurity?: boolean } }).user?.socialSecurity ??
            p.socialSecurity ??
            false,
          ssDeduction: (p as { ssDeduction?: number }).ssDeduction ?? p.ssDeduction ?? 0,
          lateBillableMinutes: p.lateBillableMinutes ?? p.lateMinutes ?? 0,
        })),
      )
      setLateSummary(data.lateSummary ?? null)
    }
    setLoading(false)
  }

  const generate = async () => {
    setGenerating(true)
    const { ok, data, status } = await apiJson('/api/payroll/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year, branchId: filterBranchId }),
    })
    if (ok) {
      toast.success(`สร้าง payroll สำเร็จ ${(data as { count?: number }).count ?? 0} คน`)
      await loadPayrolls(month, year)
    } else {
      toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
    }
    setGenerating(false)
  }

  const exportCSV = () => {
    const headers = [
      'ชื่อ',
      'รหัส',
      'แผนก',
      'เงินเดือนฐาน',
      'หักมาสาย',
      'นาทีหักมาสาย',
      'หักขาด',
      'หักลาไม่รับเงิน',
      'ประกันสังคม',
      'รับสุทธิ',
      'สถานะ',
    ]
    const rows = payrolls.map((p) => [
      p.name,
      p.employeeId,
      p.department,
      p.baseSalary.toFixed(2),
      p.lateDeduction.toFixed(2),
      String(p.lateBillableMinutes ?? p.lateMinutes),
      p.absentDeduction.toFixed(2),
      p.unpaidLeave.toFixed(2),
      p.ssDeduction.toFixed(2),
      p.netSalary.toFixed(2),
      p.status,
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll_${month}_${year}.csv`
    a.click()
  }

  const totalNet = payrolls.reduce((s, p) => s + p.netSalary, 0)
  const summary: LateSummary = lateSummary ?? {
    employeesWithLate: payrolls.filter((p) => p.lateDeduction > 0).length,
    totalLateDeduction: payrolls.reduce((s, p) => s + p.lateDeduction, 0),
    totalBillableLateMinutes: payrolls.reduce(
      (s, p) => s + (p.lateBillableMinutes ?? p.lateMinutes ?? 0),
      0,
    ),
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">เงินเดือน</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <ManualButton section="payroll" />
          <select
            value={month}
            onChange={(e) => {
              const m = parseInt(e.target.value)
              setMonth(m)
              loadPayrolls(m, year)
            }}
            className="bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-sm"
          >
            {MONTH_NAMES.slice(1).map((n, i) => (
              <option key={i + 1} value={i + 1}>
                {n}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => {
              const y = parseInt(e.target.value)
              setYear(y)
              loadPayrolls(month, y)
            }}
            className="bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-sm"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            คำนวณ
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl text-sm transition"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-hover smooth-transition bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{totalEmployees ?? payrolls.length}</p>
          <p className="text-sm text-slate-500 dark:text-white/50">พนักงานทั้งหมด</p>
        </div>
        <div className="card-hover smooth-transition bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400">
            ฿{totalNet.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-sm text-slate-500 dark:text-white/50">รวมจ่ายสุทธิ</p>
        </div>
        <div className="card-hover smooth-transition bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">
            ฿{summary.totalLateDeduction.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-slate-500 dark:text-white/50">หักมาสายรวม ({summary.employeesWithLate} คน)</p>
        </div>
        <div className="card-hover smooth-transition bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-orange-400">{summary.totalBillableLateMinutes}</p>
          <p className="text-sm text-slate-500 dark:text-white/50">นาทีหักมาสายรวม</p>
        </div>
      </div>

      <div className="glass-card card-hover rounded-2xl overflow-hidden smooth-transition">
        <div className="table-scroll">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10">
                <th className="text-left p-3 text-slate-400 dark:text-white/40 font-medium">พนักงาน</th>
                <th className="text-right p-3 text-slate-400 dark:text-white/40 font-medium">ฐาน</th>
                <th className="text-right p-3 text-slate-400 dark:text-white/40 font-medium">หักสาย</th>
                <th className="text-right p-3 text-slate-400 dark:text-white/40 font-medium">นาทีหัก</th>
                <th className="text-right p-3 text-slate-400 dark:text-white/40 font-medium">หักขาด</th>
                <th className="text-right p-3 text-slate-400 dark:text-white/40 font-medium">SS</th>
                <th className="text-right p-3 text-slate-400 dark:text-white/40 font-medium">สุทธิ</th>
                <th className="text-center p-3 text-slate-400 dark:text-white/40 font-medium">สถิติ</th>
                <th className="text-center p-3 text-slate-400 dark:text-white/40 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading && <TableSkeletonRows rows={6} cols={9} />}
              {!loading &&
                payrolls.map((p) => (
                  <tr key={p.id} className={`table-row-hover ${!p.hasPayroll ? 'opacity-70' : ''}`}>
                    <td className="p-3">
                      <p className="text-slate-900 dark:text-white font-medium">{p.name}</p>
                      <p className="text-slate-400 dark:text-white/40 text-xs">
                        {p.department} · {p.position}
                      </p>
                      {!p.hasPayroll && (
                        <p className="text-[10px] text-amber-400 mt-0.5">ยังไม่คำนวณ — กดปุ่มคำนวณ</p>
                      )}
                    </td>
                    <td className="p-3 text-right text-white/70">
                      {p.hasPayroll ? `฿${p.baseSalary.toLocaleString()}` : '—'}
                    </td>
                    <td className="p-3 text-right">
                      {p.lateDeduction > 0 ? (
                        <button
                          type="button"
                          onClick={() => setDetailRow(p)}
                          className="text-red-400 hover:text-red-300 underline underline-offset-2"
                        >
                          -฿{p.lateDeduction.toFixed(2)}
                        </button>
                      ) : (
                        <span className="text-white/30">-</span>
                      )}
                    </td>
                    <td className="p-3 text-right text-yellow-400/80 text-xs">
                      {p.hasPayroll && (p.lateBillableMinutes ?? 0) > 0
                        ? `${p.lateBillableMinutes} น.`
                        : '-'}
                    </td>
                    <td className="p-3 text-right text-red-400">
                      {p.absentDeduction > 0 ? `-฿${p.absentDeduction.toFixed(0)}` : '-'}
                    </td>
                    <td className="p-3 text-right text-orange-400">
                      {p.ssDeduction > 0 ? `-฿${p.ssDeduction.toFixed(0)}` : '-'}
                    </td>
                    <td className="p-3 text-right font-bold text-green-400">
                      {p.hasPayroll
                        ? `฿${p.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 0 })}`
                        : '—'}
                    </td>
                    <td className="p-3 text-center text-xs text-slate-400 dark:text-white/40">
                      สาย {p.lateDays} วัน · ขาด {p.absentDays} วัน
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          p.status === 'APPROVED'
                            ? 'bg-green-500/20 text-green-400'
                            : p.status === 'SENT'
                              ? 'bg-blue-500/20 text-blue-400'
                              : p.status === 'PENDING'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-white/10 text-slate-400 dark:text-white/40'
                        }`}
                      >
                        {p.status === 'APPROVED'
                          ? 'อนุมัติ'
                          : p.status === 'SENT'
                            ? 'ส่งแล้ว'
                            : p.status === 'PENDING'
                              ? 'รอคำนวณ'
                              : 'ร่าง'}
                      </span>
                    </td>
                  </tr>
                ))}
              {!loading && payrolls.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-white/30">
                    ยังไม่มีข้อมูล กด &quot;คำนวณ&quot; เพื่อสร้าง payroll
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailRow && detailRow.hasPayroll && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-200 dark:border-white/10 p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-white font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-yellow-400" />
                  รายละเอียดหักมาสาย
                </p>
                <p className="text-sm text-slate-500 dark:text-white/50 mt-0.5">{detailRow.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="p-2 rounded-lg hover:bg-white/10 text-slate-500 dark:text-white/50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <LateDeductionDetail
              baseSalary={detailRow.baseSalary}
              lateDeduction={detailRow.lateDeduction}
              lateBillableMinutes={detailRow.lateBillableMinutes ?? detailRow.lateMinutes}
              lateDays={detailRow.lateDays}
              lateDeductionDetail={detailRow.lateDeductionDetail}
            />
          </div>
        </div>
      )}
    </div>
  )
}
