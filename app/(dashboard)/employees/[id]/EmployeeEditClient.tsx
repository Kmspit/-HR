'use client'

import { useState } from 'react'
import { Save, ArrowLeft, User, Briefcase, DollarSign, AlertTriangle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

type Employee = {
  id: string; name: string; email: string; employeeId: string | null; role: string; status: string
  department: string | null; position: string | null; baseSalary: number; socialSecurity: boolean
  isCoworker: boolean; startDate: string | null; phone: string | null; lineId: string | null
  prefix: string | null; nickname: string | null; birthDate: string | null
  address: string | null; nationalId: string | null; warningCount: number
}

const ROLES = ['EMPLOYEE', 'MANAGER_HR', 'ADMIN', 'LAWYER']
const ROLE_LABELS: Record<string, string> = { EMPLOYEE: 'พนักงาน', MANAGER_HR: 'HR/ผู้จัดการ', ADMIN: 'Admin', LAWYER: 'ทนาย' }
const STATUS_LIST = ['ACTIVE', 'PENDING', 'DISABLED', 'REJECTED']
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'ใช้งาน', PENDING: 'รออนุมัติ', DISABLED: 'ระงับ', REJECTED: 'ปฏิเสธ' }

export default function EmployeeEditClient({ employee }: { employee: Employee }) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: employee.name,
    nickname: employee.nickname ?? '',
    prefix: employee.prefix ?? '',
    phone: employee.phone ?? '',
    lineId: employee.lineId ?? '',
    department: employee.department ?? '',
    position: employee.position ?? '',
    role: employee.role,
    status: employee.status,
    baseSalary: employee.baseSalary,
    socialSecurity: employee.socialSecurity,
    isCoworker: employee.isCoworker,
    startDate: employee.startDate ? employee.startDate.substring(0, 10) : '',
    address: employee.address ?? '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const { ok, data, status } = await apiJson(`/api/users/${employee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (ok) toast.success('บันทึกข้อมูลแล้ว')
      else toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
    } catch (err) {
      console.error('[employee-edit]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  const Input = ({ label, value, onChange, type = 'text', placeholder = '' }: any) => (
    <div>
      <label className="text-sm text-white/50 block mb-1">{label}</label>
      <input
        type={type} value={value ?? ''} onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) : e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
      />
    </div>
  )

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-white/5 text-white/50 transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">{employee.name}</h1>
          <p className="text-white/40 text-sm">{employee.email} · {employee.employeeId ?? 'ยังไม่มีรหัส'}</p>
        </div>
        <button onClick={save} disabled={saving} className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          บันทึก
        </button>
      </div>

      {/* Stats bar */}
      {employee.warningCount > 0 && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-sm text-yellow-400">
          <AlertTriangle className="w-4 h-4" />
          มีใบเตือน {employee.warningCount} ใบ
        </div>
      )}

      {/* Personal info */}
      <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2"><User className="w-4 h-4 text-blue-400" /> ข้อมูลส่วนตัว</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Input label="คำนำหน้า" value={form.prefix} onChange={(v: string) => set('prefix', v)} placeholder="นาย/นาง" />
          <div className="sm:col-span-2">
            <Input label="ชื่อ-นามสกุล" value={form.name} onChange={(v: string) => set('name', v)} />
          </div>
          <Input label="ชื่อเล่น" value={form.nickname} onChange={(v: string) => set('nickname', v)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="โทรศัพท์" value={form.phone} onChange={(v: string) => set('phone', v)} />
          <Input label="LINE ID" value={form.lineId} onChange={(v: string) => set('lineId', v)} placeholder="สำหรับรับแจ้งเตือน" />
        </div>
        <Input label="ที่อยู่" value={form.address} onChange={(v: string) => set('address', v)} />
      </section>

      {/* Employment info */}
      <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2"><Briefcase className="w-4 h-4 text-blue-400" /> ข้อมูลการจ้างงาน</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="แผนก" value={form.department} onChange={(v: string) => set('department', v)} />
          <Input label="ตำแหน่ง" value={form.position} onChange={(v: string) => set('position', v)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="text-sm text-white/50 block mb-1">Role</label>
            <select value={form.role} onChange={(e) => set('role', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-white/50 block mb-1">สถานะ</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500">
              {STATUS_LIST.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <Input label="วันเริ่มงาน" value={form.startDate} onChange={(v: string) => set('startDate', v)} type="date" />
          <div />
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.socialSecurity} onChange={(e) => set('socialSecurity', e.target.checked)} className="w-4 h-4 accent-blue-500" />
            <span className="text-sm text-white/70">อยู่ในระบบประกันสังคม</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isCoworker} onChange={(e) => set('isCoworker', e.target.checked)} className="w-4 h-4 accent-blue-500" />
            <span className="text-sm text-white/70">พนักงาน Coworker (จ้างชั่วคราว)</span>
          </label>
        </div>
      </section>

      {/* Salary */}
      <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2"><DollarSign className="w-4 h-4 text-blue-400" /> เงินเดือน</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="เงินเดือนฐาน (บาท/เดือน)" value={form.baseSalary} onChange={(v: number) => set('baseSalary', v)} type="number" />
          {form.socialSecurity && (
            <div className="flex items-center p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-400">
              ประกันสังคม: ฿{Math.min(form.baseSalary * 0.05, 750).toFixed(0)}/เดือน (5%, สูงสุด 750)
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
