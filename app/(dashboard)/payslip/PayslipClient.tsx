'use client'

import { useState, useMemo } from 'react'
import { FileText, ChevronDown, ChevronUp, Download, Loader2 } from 'lucide-react'
import LateDeductionDetail from '@/components/payroll/LateDeductionDetail'

type Payslip = {
  id: string
  month: number
  year: number
  baseSalary: number
  lateDeduction: number
  absentDeduction: number
  unpaidLeave: number
  ssDeduction: number
  taxDeduction: number
  netSalary: number
  lateDays: number
  absentDays: number
  lateMinutes: number
  lateBillableMinutes?: number
  lateDeductionDetail?: string | null
  status: string
}

const MONTH_NAMES = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

export default function PayslipClient({ payrolls }: { payrolls: Payslip[] }) {
  const currentYear = new Date().getFullYear()
  const availableYears = useMemo(() => {
    const ys = [...new Set(payrolls.map((p) => p.year))].sort((a, b) => b - a)
    return ys.length ? ys : [currentYear]
  }, [payrolls, currentYear])

  const [selectedYear, setSelectedYear] = useState(availableYears[0])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const filtered = useMemo(
    () => payrolls.filter((p) => p.year === selectedYear),
    [payrolls, selectedYear],
  )

  const downloadPdf = async (p: Payslip) => {
    setDownloading(p.id)
    try {
      const res = await fetch(`/api/payslip/${p.id}/pdf`)
      if (!res.ok) { alert('ไม่สามารถสร้าง PDF ได้'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `slip_${p.year}_${String(p.month).padStart(2, '0')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">สลิปเงินเดือน</h1>
        <select
          value={selectedYear}
          onChange={(e) => {
            setSelectedYear(parseInt(e.target.value))
            setExpanded(null)
          }}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
        >
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[200px] text-white/30">
          <FileText className="w-12 h-12 mb-3 opacity-30" />
          <p>ไม่มีสลิปในปี {selectedYear}</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((p) => {
          const isOpen = expanded === p.id
          return (
            <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 p-4">
                <button
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="flex-1 flex items-center gap-3 hover:opacity-80 transition text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">{MONTH_NAMES[p.month]} {p.year}</p>
                    <p className="text-green-400 text-sm font-semibold">฿{p.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                  </div>
                </button>
                <button
                  onClick={() => downloadPdf(p)}
                  disabled={downloading === p.id}
                  title="ดาวน์โหลด PDF"
                  className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition disabled:opacity-40"
                >
                  {downloading === p.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Download className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="p-2 rounded-xl hover:bg-white/10 text-white/40 transition"
                >
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-white/10 p-4 space-y-2">
                  <Row label="เงินเดือนฐาน" value={`฿${p.baseSalary.toLocaleString()}`} />
                  <div className="border-t border-white/5 pt-2 space-y-2">
                    <p className="text-xs text-white/30 font-medium uppercase tracking-wider">รายการหัก</p>
                    {p.lateDeduction > 0 && (
                      <>
                        <Row
                          label={`หักมาสาย (${p.lateDays} วัน · ${p.lateBillableMinutes ?? p.lateMinutes} นาที)`}
                          value={`-฿${p.lateDeduction.toFixed(2)}`}
                          red
                        />
                        <div className="pl-2 border-l border-white/10">
                          <LateDeductionDetail
                            baseSalary={p.baseSalary}
                            lateDeduction={p.lateDeduction}
                            lateBillableMinutes={p.lateBillableMinutes ?? p.lateMinutes}
                            lateDays={p.lateDays}
                            lateDeductionDetail={p.lateDeductionDetail}
                          />
                        </div>
                      </>
                    )}
                    {p.absentDeduction > 0 && (
                      <Row label={`หักขาดงาน (${p.absentDays} วัน)`} value={`-฿${p.absentDeduction.toFixed(2)}`} red />
                    )}
                    {p.unpaidLeave > 0 && (
                      <Row label="หักลาไม่รับเงิน" value={`-฿${p.unpaidLeave.toFixed(2)}`} red />
                    )}
                    {p.ssDeduction > 0 && (
                      <Row label="ประกันสังคม (5%)" value={`-฿${p.ssDeduction.toFixed(2)}`} red />
                    )}
                    {p.taxDeduction > 0 && (
                      <Row label="ภาษีหัก ณ ที่จ่าย (ภงด1)" value={`-฿${p.taxDeduction.toFixed(2)}`} red />
                    )}
                    {p.lateDeduction === 0 && p.absentDeduction === 0 && p.unpaidLeave === 0 && p.ssDeduction === 0 && p.taxDeduction === 0 && (
                      <p className="text-white/30 text-sm">ไม่มีรายการหัก</p>
                    )}
                  </div>
                  <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                    <span className="text-white font-bold">รับสุทธิ</span>
                    <span className="text-green-400 font-bold text-lg">฿{p.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={() => downloadPdf(p)}
                      disabled={downloading === p.id}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 hover:text-white transition text-sm disabled:opacity-40"
                    >
                      {downloading === p.id
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลังสร้าง PDF...</>
                        : <><Download className="w-4 h-4" /> ดาวน์โหลด PDF</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Row({ label, value, red = false }: { label: string; value: string; red?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-white/60">{label}</span>
      <span className={red ? 'text-red-400' : 'text-white/80'}>{value}</span>
    </div>
  )
}
