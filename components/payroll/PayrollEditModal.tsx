'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import PortalModal from '@/components/ui/PortalModal'

type RelatedPerson = { name: string; role: string }

type ProfessionalFeePayment = {
  id: string
  hiringCompany: string
  jobType: string
  amount: number
  paidAt: string
  taxWithheld: number
  relatedPersons: RelatedPerson[]
}

type FullPayroll = {
  id: string
  status: string
  backPay: number
  commission: number
  overtimePay: number
  bonus: number
  professionalFee: number
  professionalFeeTax: number
  netSalary: number
}

type Props = {
  payrollId: string
  employeeName: string
  onClose: () => void
  /** เรียกหลังบันทึกสำเร็จ (แก้ backPay/commission หรือ เพิ่ม/ลบรายการ 40(6))
   * เพื่อให้หน้ารายการ payroll หลัก refresh netSalary ที่โชว์อยู่ */
  onSaved: () => void
}

const ROLE_PRESETS = ['ผู้กู้', 'ผู้ค้ำประกัน', 'ทายาทโดยธรรม']

const emptyPersonRow: RelatedPerson = { name: '', role: '' }

export default function PayrollEditModal({ payrollId, employeeName, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [payroll, setPayroll] = useState<FullPayroll | null>(null)
  const [payments, setPayments] = useState<ProfessionalFeePayment[]>([])

  const [backPay, setBackPay] = useState('0')
  const [commission, setCommission] = useState('0')
  const [overtimePay, setOvertimePay] = useState('0')
  const [bonus, setBonus] = useState('0')
  const [savingBasic, setSavingBasic] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [hiringCompany, setHiringCompany] = useState('')
  const [jobType, setJobType] = useState('')
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [relatedPersons, setRelatedPersons] = useState<RelatedPerson[]>([{ ...emptyPersonRow }])
  const [savingFee, setSavingFee] = useState(false)
  const [deletingFeeId, setDeletingFeeId] = useState<string | null>(null)

  const isDraft = payroll?.status === 'DRAFT'

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [payrollRes, feesRes] = await Promise.all([
        apiJson<{ payroll?: FullPayroll }>(`/api/payroll/${payrollId}`),
        apiJson<{ payments?: ProfessionalFeePayment[] }>(`/api/payroll/${payrollId}/professional-fee`),
      ])
      if (cancelled) return
      if (payrollRes.ok && payrollRes.data.payroll) {
        setPayroll(payrollRes.data.payroll)
        setBackPay(String(payrollRes.data.payroll.backPay ?? 0))
        setCommission(String(payrollRes.data.payroll.commission ?? 0))
        setOvertimePay(String(payrollRes.data.payroll.overtimePay ?? 0))
        setBonus(String(payrollRes.data.payroll.bonus ?? 0))
      } else {
        toast.error(apiErrorMessage(payrollRes.data, 'โหลดข้อมูล payroll ไม่สำเร็จ', payrollRes.status))
      }
      if (feesRes.ok && feesRes.data.payments) {
        setPayments(feesRes.data.payments)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [payrollId])

  const saveBasic = async () => {
    const backPayNum = Number(backPay)
    const commissionNum = Number(commission)
    const overtimePayNum = Number(overtimePay)
    const bonusNum = Number(bonus)
    if (!Number.isFinite(backPayNum) || backPayNum < 0) {
      toast.error('ตกเบิกต้องเป็นตัวเลขไม่ติดลบ')
      return
    }
    if (!Number.isFinite(commissionNum) || commissionNum < 0) {
      toast.error('คอมมิชชั่นต้องเป็นตัวเลขไม่ติดลบ')
      return
    }
    if (!Number.isFinite(overtimePayNum) || overtimePayNum < 0) {
      toast.error('ค่าล่วงเวลาต้องเป็นตัวเลขไม่ติดลบ')
      return
    }
    if (!Number.isFinite(bonusNum) || bonusNum < 0) {
      toast.error('โบนัสต้องเป็นตัวเลขไม่ติดลบ')
      return
    }
    setSavingBasic(true)
    const { ok, data, status } = await apiJson<{ payroll?: FullPayroll }>(`/api/payroll/${payrollId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        backPay: backPayNum,
        commission: commissionNum,
        overtimePay: overtimePayNum,
        bonus: bonusNum,
      }),
    })
    if (ok && data.payroll) {
      setPayroll(data.payroll)
      toast.success('บันทึกตกเบิก/คอมมิชชั่น/OT/โบนัสแล้ว')
      onSaved()
    } else {
      toast.error(apiErrorMessage(data, 'บันทึกไม่สำเร็จ', status))
    }
    setSavingBasic(false)
  }

  const addPersonRow = () => setRelatedPersons((rows) => [...rows, { ...emptyPersonRow }])
  const removePersonRow = (idx: number) =>
    setRelatedPersons((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)))
  const updatePersonRow = (idx: number, field: keyof RelatedPerson, value: string) =>
    setRelatedPersons((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))

  const resetAddForm = () => {
    setHiringCompany('')
    setJobType('')
    setAmount('')
    setPaidAt(new Date().toISOString().slice(0, 10))
    setRelatedPersons([{ ...emptyPersonRow }])
  }

  const submitFee = async () => {
    const amountNum = Number(amount)
    if (!hiringCompany.trim()) return toast.error('กรุณาระบุบริษัทผู้ว่าจ้าง')
    if (!jobType.trim()) return toast.error('กรุณาระบุประเภทงาน')
    if (!Number.isFinite(amountNum) || amountNum <= 0) return toast.error('จำนวนเงินต้องมากกว่า 0')
    const cleanedPersons = relatedPersons
      .map((p) => ({ name: p.name.trim(), role: p.role.trim() }))
      .filter((p) => p.name && p.role)
    if (cleanedPersons.length === 0) {
      return toast.error('กรุณาระบุรายชื่อบุคคลที่เกี่ยวข้องอย่างน้อย 1 คน พร้อมบทบาท')
    }

    setSavingFee(true)
    const { ok, data, status } = await apiJson<{ payment?: ProfessionalFeePayment }>(
      `/api/payroll/${payrollId}/professional-fee`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hiringCompany: hiringCompany.trim(),
          jobType: jobType.trim(),
          amount: amountNum,
          paidAt,
          relatedPersons: cleanedPersons,
        }),
      },
    )
    if (ok && data.payment) {
      setPayments((prev) => [...prev, data.payment!])
      toast.success('เพิ่มรายการค่าวิชาชีพแล้ว')
      resetAddForm()
      setShowAddForm(false)
      // netSalary ของ payroll เปลี่ยนจากรายการนี้ — โหลด payroll ใหม่
      const refreshed = await apiJson<{ payroll?: FullPayroll }>(`/api/payroll/${payrollId}`)
      if (refreshed.ok && refreshed.data.payroll) setPayroll(refreshed.data.payroll)
      onSaved()
    } else {
      toast.error(apiErrorMessage(data, 'เพิ่มรายการไม่สำเร็จ', status))
    }
    setSavingFee(false)
  }

  const deleteFee = async (feeId: string) => {
    setDeletingFeeId(feeId)
    const { ok, data, status } = await apiJson(`/api/payroll/${payrollId}/professional-fee/${feeId}`, {
      method: 'DELETE',
    })
    if (ok) {
      setPayments((prev) => prev.filter((p) => p.id !== feeId))
      toast.success('ลบรายการแล้ว')
      const refreshed = await apiJson<{ payroll?: FullPayroll }>(`/api/payroll/${payrollId}`)
      if (refreshed.ok && refreshed.data.payroll) setPayroll(refreshed.data.payroll)
      onSaved()
    } else {
      toast.error(apiErrorMessage(data, 'ลบไม่สำเร็จ', status))
    }
    setDeletingFeeId(null)
  }

  return (
    <PortalModal
      onClose={onClose}
      ariaLabel={`แก้ไข payroll: ${employeeName}`}
      backdropClassName="bg-black/60"
      wrapperClassName="flex min-h-full items-end sm:items-center justify-center p-4"
      panelClassName="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-200 dark:border-white/10 p-5 shadow-2xl max-h-[85dvh] overflow-y-auto"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-white font-semibold">แก้ไข payroll (ร่าง)</p>
          <p className="text-sm text-slate-500 dark:text-white/50 mt-0.5">{employeeName}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="ปิด" className="p-2 rounded-lg hover:bg-white/10 text-slate-500 dark:text-white/50">
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-white/50">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : !isDraft ? (
        <p className="text-amber-400 text-sm py-4">
          payroll นี้ไม่ใช่สถานะร่าง (DRAFT) แล้ว — แก้ไขตกเบิก/คอมมิชชั่น/OT/โบนัส/ค่าวิชาชีพไม่ได้อีกต่อไป
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-white/70">
              ตกเบิก (บาท)
              <input
                type="number" min={0} value={backPay} onChange={(e) => setBackPay(e.target.value)}
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm text-white/70">
              คอมมิชชั่น (บาท)
              <input
                type="number" min={0} value={commission} onChange={(e) => setCommission(e.target.value)}
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm text-white/70">
              ค่าล่วงเวลา (OT) (บาท)
              <input
                type="number" min={0} value={overtimePay} onChange={(e) => setOvertimePay(e.target.value)}
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm text-white/70">
              โบนัส (บาท)
              <input
                type="number" min={0} value={bonus} onChange={(e) => setBonus(e.target.value)}
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white"
              />
            </label>
          </div>
          <button
            type="button" onClick={saveBasic} disabled={savingBasic}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50"
          >
            {savingBasic && <Loader2 className="w-4 h-4 animate-spin" />}
            บันทึกตกเบิก/คอมมิชชั่น/OT/โบนัส
          </button>

          <div className="border-t border-white/10 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white font-medium text-sm">
                ค่าวิชาชีพ 40(6) — รวม ฿{(payroll?.professionalFee ?? 0).toLocaleString()} (หักภาษี ฿{(payroll?.professionalFeeTax ?? 0).toLocaleString()})
              </p>
              <button
                type="button" onClick={() => setShowAddForm((v) => !v)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
              >
                <Plus className="w-3.5 h-3.5" /> เพิ่มรายการ
              </button>
            </div>

            {payments.length > 0 && (
              <ul className="space-y-2 mb-3">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 rounded-lg bg-white/5 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-white/90">{p.hiringCompany} — {p.jobType}</p>
                      <p className="text-white/50 text-xs">
                        ฿{p.amount.toLocaleString()} · หักภาษี ฿{p.taxWithheld.toLocaleString()} · {new Date(p.paidAt).toLocaleDateString('th-TH')}
                      </p>
                      <p className="text-white/40 text-xs">
                        {p.relatedPersons.map((r) => `${r.name} (${r.role})`).join(', ')}
                      </p>
                    </div>
                    <button
                      type="button" onClick={() => deleteFee(p.id)} disabled={deletingFeeId === p.id}
                      className="shrink-0 p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                      aria-label="ลบรายการนี้"
                    >
                      {deletingFeeId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {showAddForm && (
              <div className="space-y-3 rounded-lg bg-white/5 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-white/70">
                    บริษัทผู้ว่าจ้าง
                    <input value={hiringCompany} onChange={(e) => setHiringCompany(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm" />
                  </label>
                  <label className="text-xs text-white/70">
                    ประเภทงาน
                    <input value={jobType} onChange={(e) => setJobType(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm" />
                  </label>
                  <label className="text-xs text-white/70">
                    จำนวนเงิน (บาท)
                    <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm" />
                  </label>
                  <label className="text-xs text-white/70">
                    วันที่จ่าย
                    <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm" />
                  </label>
                </div>

                <div>
                  <p className="text-xs text-white/70 mb-1">บุคคลที่เกี่ยวข้อง (เช่น ผู้กู้/ผู้ค้ำประกัน/ทายาทโดยธรรม)</p>
                  <div className="space-y-2">
                    {relatedPersons.map((row, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          value={row.name} placeholder="ชื่อ"
                          onChange={(e) => updatePersonRow(idx, 'name', e.target.value)}
                          className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm"
                        />
                        <input
                          value={row.role} placeholder="บทบาท เช่น ผู้กู้"
                          list="role-presets"
                          onChange={(e) => updatePersonRow(idx, 'role', e.target.value)}
                          className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm"
                        />
                        <button
                          type="button" onClick={() => removePersonRow(idx)}
                          disabled={relatedPersons.length <= 1}
                          className="shrink-0 p-2 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-30"
                          aria-label="ลบแถวนี้"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <datalist id="role-presets">
                      {ROLE_PRESETS.map((r) => <option key={r} value={r} />)}
                    </datalist>
                  </div>
                  <button
                    type="button" onClick={addPersonRow}
                    className="mt-2 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                  >
                    <Plus className="w-3.5 h-3.5" /> เพิ่มบุคคล
                  </button>
                </div>

                <button
                  type="button" onClick={submitFee} disabled={savingFee}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50"
                >
                  {savingFee && <Loader2 className="w-4 h-4 animate-spin" />}
                  บันทึกรายการนี้
                </button>
              </div>
            )}
          </div>

          <p className="text-right text-white/70 text-sm border-t border-white/10 pt-3">
            สุทธิล่าสุด: <span className="font-bold text-green-400">฿{(payroll?.netSalary ?? 0).toLocaleString('th-TH')}</span>
          </p>
        </div>
      )}
    </PortalModal>
  )
}
