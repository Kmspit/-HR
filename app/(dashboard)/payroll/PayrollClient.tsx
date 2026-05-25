'use client'

import { useState } from 'react'
import { DollarSign, FileText, Send, Download, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

type PayrollRow = {
  id: string; userId: string; name: string; employeeId: string
  department: string; position: string; socialSecurity: boolean
  baseSalary: number; lateDeduction: number; absentDeduction: number
  unpaidLeave: number; ssDeduction: number; netSalary: number
  lateDays: number; absentDays: number; lateMinutes: number; status: string
}

type Props = {
  month: number; year: number; payrolls: PayrollRow[]
}

const MONTH_NAMES = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

export default function PayrollClient({ month: initMonth, year: initYear, payrolls: initPayrolls }: Props) {
  const [month, setMonth] = useState(initMonth)
  const [year, setYear] = useState(initYear)
  const [payrolls, setPayrolls] = useState(initPayrolls)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadPayrolls = async (m: number, y: number) => {
    setLoading(true)
    const res = await fetch(`/api/payroll/report?month=${m}&year=${y}`)
    const data = await res.json()
    setPayrolls(data.payrolls?.map((p: any) => ({
      ...p,
      name: p.user?.name ?? '', employeeId: p.user?.employeeId ?? '',
      department: p.user?.department ?? '', position: p.user?.position ?? '',
      socialSecurity: p.user?.socialSecurity ?? false,
      ssDeduction: p.socialSecurity,
    })) ?? [])
    setLoading(false)
  }

  const generate = async () => {
    setGenerating(true)
    const res = await fetch('/api/payroll/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year }),
    })
    const data = await res.json()
    if (res.ok) {
      toast.success(`สร้าง payroll สำเร็จ ${data.count} คน`)
      await loadPayrolls(month, year)
    } else {
      toast.error(data.error)
    }
    setGenerating(false)
  }

  const exportCSV = () => {
    const headers = ['ชื่อ','รหัส','แผนก','เงินเดือนฐาน','หักมาสาย','หักขาด','หักลาไม่รับเงิน','ประกันสังคม','รับสุทธิ','สถานะ']
    const rows = payrolls.map((p) => [
      p.name, p.employeeId, p.department,
      p.baseSalary.toFixed(2), p.lateDeduction.toFixed(2), p.absentDeduction.toFixed(2),
      p.unpaidLeave.toFixed(2), p.ssDeduction.toFixed(2), p.netSalary.toFixed(2), p.status,
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

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">เงินเดือน</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={month}
            onChange={(e) => { const m = parseInt(e.target.value); setMonth(m); loadPayrolls(m, year) }}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
          >
            {MONTH_NAMES.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
          </select>
          <select
            value={year}
            onChange={(e) => { const y = parseInt(e.target.value); setYear(y); loadPayrolls(month, y) }}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
          >
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={generate} disabled={generating} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            คำนวณ
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 border border-white/10 text-white/60 hover:bg-white/5 rounded-xl text-sm transition">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{payrolls.length}</p>
          <p className="text-sm text-white/50">พนักงาน</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400">฿{totalNet.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
          <p className="text-sm text-white/50">รวมจ่ายสุทธิ</p>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">
            {payrolls.filter((p) => p.status === 'APPROVED').length}/{payrolls.length}
          </p>
          <p className="text-sm text-white/50">อนุมัติแล้ว</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-3 text-white/40 font-medium">พนักงาน</th>
                <th className="text-right p-3 text-white/40 font-medium">ฐาน</th>
                <th className="text-right p-3 text-white/40 font-medium">หักสาย</th>
                <th className="text-right p-3 text-white/40 font-medium">หักขาด</th>
                <th className="text-right p-3 text-white/40 font-medium">SS</th>
                <th className="text-right p-3 text-white/40 font-medium">สุทธิ</th>
                <th className="text-center p-3 text-white/40 font-medium">สถิติ</th>
                <th className="text-center p-3 text-white/40 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {payrolls.map((p) => (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="p-3">
                    <p className="text-white font-medium">{p.name}</p>
                    <p className="text-white/40 text-xs">{p.department} · {p.position}</p>
                  </td>
                  <td className="p-3 text-right text-white/70">฿{p.baseSalary.toLocaleString()}</td>
                  <td className="p-3 text-right text-red-400">
                    {p.lateDeduction > 0 ? `-฿${p.lateDeduction.toFixed(0)}` : '-'}
                  </td>
                  <td className="p-3 text-right text-red-400">
                    {p.absentDeduction > 0 ? `-฿${p.absentDeduction.toFixed(0)}` : '-'}
                  </td>
                  <td className="p-3 text-right text-orange-400">
                    {p.ssDeduction > 0 ? `-฿${p.ssDeduction.toFixed(0)}` : '-'}
                  </td>
                  <td className="p-3 text-right font-bold text-green-400">฿{p.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 0 })}</td>
                  <td className="p-3 text-center text-xs text-white/40">
                    สาย {p.lateDays}ครั้ง · ขาด {p.absentDays}วัน
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${p.status === 'APPROVED' ? 'bg-green-500/20 text-green-400' : p.status === 'SENT' ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-white/40'}`}>
                      {p.status === 'APPROVED' ? 'อนุมัติ' : p.status === 'SENT' ? 'ส่งแล้ว' : 'ร่าง'}
                    </span>
                  </td>
                </tr>
              ))}
              {payrolls.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-white/30">
                    {loading ? 'กำลังโหลด...' : 'ยังไม่มีข้อมูล กด "คำนวณ" เพื่อสร้าง payroll'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
