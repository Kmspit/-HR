'use client'

import { useState } from 'react'
import { FileText, ChevronDown, ChevronUp } from 'lucide-react'

type Payslip = {
  id: string; month: number; year: number
  baseSalary: number; lateDeduction: number; absentDeduction: number
  unpaidLeave: number; ssDeduction: number; netSalary: number
  lateDays: number; absentDays: number; status: string
}

const MONTH_NAMES = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

export default function PayslipClient({ payrolls }: { payrolls: Payslip[] }) {
  const [expanded, setExpanded] = useState<string | null>(payrolls[0]?.id ?? null)

  if (payrolls.length === 0) {
    return (
      <div className="p-4 md:p-6 flex flex-col items-center justify-center min-h-[300px] text-white/30">
        <FileText className="w-12 h-12 mb-3 opacity-30" />
        <p>ยังไม่มีสลิปเงินเดือน</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">สลิปเงินเดือน</h1>
      <div className="space-y-3">
        {payrolls.map((p) => {
          const isOpen = expanded === p.id
          return (
            <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : p.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-white font-medium">{MONTH_NAMES[p.month]} {p.year}</p>
                    <p className="text-green-400 text-sm font-semibold">฿{p.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
              </button>
              {isOpen && (
                <div className="border-t border-white/10 p-4 space-y-2">
                  <Row label="เงินเดือนฐาน" value={`฿${p.baseSalary.toLocaleString()}`} />
                  <div className="border-t border-white/5 pt-2 space-y-2">
                    <p className="text-xs text-white/30 font-medium uppercase">รายการหัก</p>
                    {p.lateDeduction > 0 && <Row label={`หักมาสาย (${p.lateDays} ครั้ง)`} value={`-฿${p.lateDeduction.toFixed(2)}`} red />}
                    {p.absentDeduction > 0 && <Row label={`หักขาดงาน (${p.absentDays} วัน)`} value={`-฿${p.absentDeduction.toFixed(2)}`} red />}
                    {p.unpaidLeave > 0 && <Row label="หักลาไม่รับเงิน" value={`-฿${p.unpaidLeave.toFixed(2)}`} red />}
                    {p.ssDeduction > 0 && <Row label="ประกันสังคม (5%)" value={`-฿${p.ssDeduction.toFixed(2)}`} red />}
                    {p.lateDeduction === 0 && p.absentDeduction === 0 && p.unpaidLeave === 0 && p.ssDeduction === 0 && (
                      <p className="text-white/30 text-sm">ไม่มีรายการหัก</p>
                    )}
                  </div>
                  <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                    <span className="text-white font-bold">รับสุทธิ</span>
                    <span className="text-green-400 font-bold text-lg">฿{p.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
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
