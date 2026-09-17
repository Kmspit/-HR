'use client'

import { useState } from 'react'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import FormField from '@/components/profile/FormField'
import { profileInputClass } from '@/lib/profile-validators-client'

export type SecurityDepositPlan = {
  id: string
  userId: string
  totalAmount: number
  totalInstallments: number
  status: string
  startMonth: number
  startYear: number
  createdAt: string
  updatedAt: string
}

const MONTH_NAMES = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** เงินประกัน 6 งวด (หรือจำนวนงวดที่ตกลง) — payroll fields batch 2 (2026-09).
 * งวดที่หักไปแล้วกี่งวด derive จาก Payroll จริงตอน generate เสมอ (ไม่เก็บ
 * counter ในนี้) หน้านี้แค่สร้าง/ยกเลิกตัวแผน (totalAmount/totalInstallments) */
export default function SecurityDepositSection({
  userId,
  initialPlan,
}: {
  userId: string
  initialPlan: SecurityDepositPlan | null
}) {
  const [plan, setPlan] = useState(initialPlan)
  const [showForm, setShowForm] = useState(false)
  const [totalAmount, setTotalAmount] = useState('')
  const [totalInstallments, setTotalInstallments] = useState('6')
  const now = new Date()
  const [startMonth, setStartMonth] = useState(String(now.getMonth() + 1))
  const [startYear, setStartYear] = useState(String(now.getFullYear()))
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const createPlan = async () => {
    const amountNum = Number(totalAmount)
    const installmentsNum = Number(totalInstallments)
    const monthNum = Number(startMonth)
    const yearNum = Number(startYear)
    if (!Number.isFinite(amountNum) || amountNum <= 0) return toast.error('จำนวนเงินประกันต้องมากกว่า 0')
    if (!Number.isInteger(installmentsNum) || installmentsNum <= 0) return toast.error('จำนวนงวดต้องเป็นจำนวนเต็มมากกว่า 0')
    if (monthNum < 1 || monthNum > 12) return toast.error('เดือนเริ่มหักไม่ถูกต้อง')

    setSaving(true)
    const { ok, data, status } = await apiJson<{ plan?: SecurityDepositPlan }>(
      `/api/users/${userId}/security-deposit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalAmount: amountNum,
          totalInstallments: installmentsNum,
          startMonth: monthNum,
          startYear: yearNum,
        }),
      },
    )
    if (ok && data.plan) {
      setPlan(data.plan)
      setShowForm(false)
      toast.success('สร้างแผนเงินประกันแล้ว')
    } else {
      toast.error(apiErrorMessage(data, 'สร้างแผนไม่สำเร็จ', status))
    }
    setSaving(false)
  }

  const cancelPlan = async () => {
    if (!plan) return
    const confirmed = window.confirm('ยกเลิกแผนเงินประกันนี้? การหักในเดือนถัดไปจะหยุดทันที')
    if (!confirmed) return
    setCancelling(true)
    const { ok, data, status } = await apiJson<{ plan?: SecurityDepositPlan }>(
      `/api/users/${userId}/security-deposit`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      },
    )
    if (ok && data.plan) {
      setPlan(data.plan)
      toast.success('ยกเลิกแผนเงินประกันแล้ว')
    } else {
      toast.error(apiErrorMessage(data, 'ยกเลิกไม่สำเร็จ', status))
    }
    setCancelling(false)
  }

  return (
    <section className="glass-card rounded-2xl p-5 space-y-4">
      <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
        <ShieldCheck className="w-4 h-4 text-blue-400" /> เงินประกันการทำงาน
      </h2>

      {plan && plan.status === 'ACTIVE' ? (
        <div className="space-y-3">
          <p className="text-sm text-white/70">
            ยอดรวม ฿{plan.totalAmount.toLocaleString()} · แบ่งจ่าย {plan.totalInstallments} งวด · เริ่มหัก{' '}
            {MONTH_NAMES[plan.startMonth]} {plan.startYear}
          </p>
          <p className="text-xs text-white/40">
            งวดที่หักไปแล้วกี่งวด ระบบคำนวณให้อัตโนมัติทุกครั้งที่ generate payroll (ดูได้ที่หมายเหตุในสลิป/Excel export)
          </p>
          <button
            type="button"
            onClick={cancelPlan}
            disabled={cancelling}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
          >
            {cancelling && <Loader2 className="w-4 h-4 animate-spin inline mr-1" />}
            ยกเลิกแผนเงินประกัน
          </button>
        </div>
      ) : plan && plan.status === 'COMPLETED' ? (
        <p className="text-sm text-emerald-400">
          หักครบ {plan.totalInstallments} งวดแล้ว (ยอดรวม ฿{plan.totalAmount.toLocaleString()})
        </p>
      ) : plan && plan.status === 'CANCELLED' ? (
        <p className="text-sm text-white/40">แผนก่อนหน้าถูกยกเลิกแล้ว — สร้างแผนใหม่ได้ถ้าจำเป็น</p>
      ) : (
        <p className="text-sm text-white/40">ยังไม่มีแผนเงินประกันสำหรับพนักงานคนนี้</p>
      )}

      {(!plan || plan.status !== 'ACTIVE') && !showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
        >
          + สร้างแผนเงินประกันใหม่
        </button>
      )}

      {showForm && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10">
          <FormField label="ยอดเงินประกันรวม (บาท)">
            <input
              type="number"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              className={profileInputClass}
            />
          </FormField>
          <FormField label="จำนวนงวด">
            <input
              type="number"
              value={totalInstallments}
              onChange={(e) => setTotalInstallments(e.target.value)}
              className={profileInputClass}
            />
          </FormField>
          <FormField label="เดือนเริ่มหัก">
            <select value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className={profileInputClass}>
              {MONTH_NAMES.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1} className="bg-slate-900">{m}</option>
              ))}
            </select>
          </FormField>
          <FormField label="ปีเริ่มหัก (ค.ศ.)">
            <input
              type="number"
              value={startYear}
              onChange={(e) => setStartYear(e.target.value)}
              className={profileInputClass}
            />
          </FormField>
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="button"
              onClick={createPlan}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin inline mr-1" />}
              บันทึกแผนเงินประกัน
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white/50 hover:bg-white/5"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
