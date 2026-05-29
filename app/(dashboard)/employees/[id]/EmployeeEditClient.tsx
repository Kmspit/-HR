'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Save,
  ArrowLeft,
  User,
  Briefcase,
  DollarSign,
  AlertTriangle,
  Loader2,
  MessageCircle,
  Mail,
  Shield,
  Send,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import FormField from '@/components/profile/FormField'
import { isValidLineIdInput, lineIdHint } from '@/lib/line-id-client'
import {
  isValidEmailInput,
  isValidNationalIdInput,
  isValidThaiPhoneInput,
  profileInputClass,
  profileInputErrorClass,
} from '@/lib/profile-validators-client'

type Employee = {
  id: string
  name: string
  email: string
  employeeId: string | null
  role: string
  status: string
  department: string | null
  position: string | null
  baseSalary: number
  socialSecurity: boolean
  isCoworker: boolean
  startDate: string | null
  phone: string | null
  lineId: string | null
  lineUserId: string | null
  lineDisplayName: string | null
  prefix: string | null
  nickname: string | null
  birthDate: string | null
  address: string | null
  nationalId: string | null
  warningCount: number
}

const ROLES = ['EMPLOYEE', 'MANAGER_HR', 'ADMIN', 'LAWYER']
const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: 'พนักงาน',
  MANAGER_HR: 'HR/ผู้จัดการ',
  ADMIN: 'Admin',
  LAWYER: 'ทนาย',
}
const STATUS_LIST = ['ACTIVE', 'PENDING', 'DISABLED', 'REJECTED']
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'ใช้งาน',
  PENDING: 'รออนุมัติ',
  DISABLED: 'ระงับ',
  REJECTED: 'ปฏิเสธ',
}

type FormErrors = Partial<Record<string, string>>

export default function EmployeeEditClient({
  employee,
  currentUserId,
}: {
  employee: Employee
  currentUserId: string
}) {
  const router = useRouter()
  const isSelf = employee.id === currentUserId
  const [form, setForm] = useState({
    name: employee.name,
    email: employee.email,
    nickname: employee.nickname ?? '',
    prefix: employee.prefix ?? '',
    phone: employee.phone ?? '',
    lineId: employee.lineId ?? '',
    lineUserId: employee.lineUserId ?? '',
    lineDisplayName: employee.lineDisplayName ?? '',
    department: employee.department ?? '',
    position: employee.position ?? '',
    role: employee.role,
    status: employee.status,
    baseSalary: employee.baseSalary,
    socialSecurity: employee.socialSecurity,
    isCoworker: employee.isCoworker,
    startDate: employee.startDate ? employee.startDate.substring(0, 10) : '',
    birthDate: employee.birthDate ? employee.birthDate.substring(0, 10) : '',
    address: employee.address ?? '',
    nationalId: employee.nationalId ?? '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof form, v: string | number | boolean) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const ic = (key: string) => (errors[key] ? profileInputErrorClass : profileInputClass)

  const validate = (): FormErrors => {
    const e: FormErrors = {}
    if (!form.name.trim()) e.name = 'กรุณากรอกชื่อ'
    if (!isValidEmailInput(form.email)) e.email = 'อีเมลไม่ถูกต้อง'
    if (!isValidThaiPhoneInput(form.phone)) e.phone = 'เบอร์ 10 หลัก'
    if (form.lineId.trim() && !isValidLineIdInput(form.lineId)) e.lineId = lineIdHint()
    if (!isValidNationalIdInput(form.nationalId)) e.nationalId = 'เลขบัตร 13 หลัก'
    if (form.birthDate) {
      const d = new Date(form.birthDate)
      if (Number.isNaN(d.getTime()) || d > new Date()) e.birthDate = 'วันเกิดไม่ถูกต้อง'
    }
    return e
  }

  const save = async () => {
    const v = validate()
    if (Object.keys(v).length) {
      setErrors(v)
      toast.error('กรุณาตรวจสอบข้อมูล')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        nickname: form.nickname.trim() || null,
        prefix: form.prefix.trim() || null,
        phone: form.phone,
        address: form.address.trim() || null,
        birthDate: form.birthDate || null,
        nationalId: form.nationalId.replace(/\D/g, '') || null,
        lineId: form.lineId,
        lineUserId: form.lineUserId,
        lineDisplayName: form.lineDisplayName,
        department: form.department,
        position: form.position,
        baseSalary: form.baseSalary,
        socialSecurity: form.socialSecurity,
        isCoworker: form.isCoworker,
        startDate: form.startDate || null,
      }
      if (!isSelf) {
        payload.role = form.role
        payload.status = form.status
      }

      const { ok, data, status } = await apiJson(`/api/users/${employee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (ok) {
        toast.success('บันทึกข้อมูลแล้ว')
        router.refresh()
      } else {
        toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
      }
    } catch (err) {
      console.error('[employee-edit]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 pb-28 md:pb-8 max-w-4xl mx-auto space-y-5 md:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 rounded-xl hover:bg-white/5 text-white/50 transition flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-white truncate">{employee.name}</h1>
            <p className="text-white/40 text-sm truncate">
              {employee.employeeId ?? 'ยังไม่มีรหัส'} · {ROLE_LABELS[employee.role] ?? employee.role}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="hidden sm:flex ml-auto items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          บันทึก
        </button>
      </div>

      {employee.warningCount > 0 && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-sm text-yellow-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          มีใบเตือน {employee.warningCount} ใบ
        </div>
      )}

      {isSelf && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-200/90">
          <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>กำลังแก้โปรไฟล์ตัวเอง — ไม่สามารถเปลี่ยน Role/สถานะได้ (ให้ Admin คนอื่นช่วย)</span>
        </div>
      )}

      <section className="glass-card rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
          <User className="w-4 h-4 text-blue-400" /> ข้อมูลส่วนตัว
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <FormField label="คำนำหน้า">
            <input
              value={form.prefix}
              onChange={(e) => set('prefix', e.target.value)}
              className={profileInputClass}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="ชื่อ-นามสกุล" required error={errors.name}>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className={ic('name')}
              />
            </FormField>
          </div>
          <FormField label="ชื่อเล่น">
            <input
              value={form.nickname}
              onChange={(e) => set('nickname', e.target.value)}
              className={profileInputClass}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="วันเกิด" error={errors.birthDate}>
            <input
              type="date"
              value={form.birthDate}
              onChange={(e) => set('birthDate', e.target.value)}
              className={ic('birthDate')}
            />
          </FormField>
          <FormField label="เลขบัตรประชาชน" error={errors.nationalId}>
            <input
              value={form.nationalId}
              onChange={(e) => set('nationalId', e.target.value.replace(/\D/g, '').slice(0, 13))}
              className={ic('nationalId')}
              inputMode="numeric"
            />
          </FormField>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
          <Mail className="w-4 h-4 text-cyan-400" /> ข้อมูลติดต่อ
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="อีเมล" required error={errors.email}>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className={ic('email')}
            />
          </FormField>
          <FormField label="โทรศัพท์" required error={errors.phone}>
            <input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              className={ic('phone')}
              inputMode="tel"
            />
          </FormField>
        </div>
        <FormField label="ที่อยู่">
          <textarea
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            rows={2}
            className={`${profileInputClass} resize-none`}
          />
        </FormField>
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-4 border border-green-500/15">
        <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
          <MessageCircle className="w-4 h-4 text-green-400" /> LINE Integration
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="LINE ID" error={errors.lineId} hint={lineIdHint()}>
            <input
              value={form.lineId}
              onChange={(e) => set('lineId', e.target.value)}
              placeholder="@kmsp.hr"
              className={ic('lineId')}
            />
          </FormField>
          <FormField label="LINE User ID" hint="U + 32 ตัว hex">
            <input
              value={form.lineUserId}
              onChange={(e) => set('lineUserId', e.target.value)}
              className={profileInputClass}
              placeholder="Uxxxxxxxx"
            />
          </FormField>
        </div>
        <FormField label="ชื่อแสดงใน LINE">
          <input
            value={form.lineDisplayName}
            onChange={(e) => set('lineDisplayName', e.target.value)}
            className={profileInputClass}
          />
        </FormField>
        <Link
          href={`/line-oa?userId=${employee.id}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#06C755]/15 border border-[#06C755]/30 text-[#06C755] text-sm font-semibold hover:bg-[#06C755]/25 transition"
        >
          <Send className="w-4 h-4" />
          ส่งข้อความเข้า LINE
        </Link>
        {!form.lineUserId && (
          <p className="text-[11px] text-amber-400">
            ยังไม่ผูก LINE OA — พนักงานต้องสร้างรหัสที่โปรไฟล์ก่อนจึงส่งถึงได้
          </p>
        )}
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
          <Briefcase className="w-4 h-4 text-blue-400" /> ข้อมูลการจ้างงาน
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="แผนก">
            <input
              value={form.department}
              onChange={(e) => set('department', e.target.value)}
              className={profileInputClass}
            />
          </FormField>
          <FormField label="ตำแหน่ง">
            <input
              value={form.position}
              onChange={(e) => set('position', e.target.value)}
              className={profileInputClass}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FormField label="Role">
            {isSelf ? (
              <p className="py-2.5 text-sm text-white/70">{ROLE_LABELS[form.role] ?? form.role}</p>
            ) : (
              <select
                value={form.role}
                onChange={(e) => set('role', e.target.value)}
                className={profileInputClass}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} className="bg-slate-900">
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="สถานะ">
            {isSelf ? (
              <p className="py-2.5 text-sm text-white/70">{STATUS_LABELS[form.status] ?? form.status}</p>
            ) : (
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className={profileInputClass}
              >
                {STATUS_LIST.map((s) => (
                  <option key={s} value={s} className="bg-slate-900">
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="วันเริ่มงาน">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => set('startDate', e.target.value)}
              className={profileInputClass}
            />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.socialSecurity}
              onChange={(e) => set('socialSecurity', e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-sm text-white/70">ประกันสังคม</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isCoworker}
              onChange={(e) => set('isCoworker', e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-sm text-white/70">พนักงาน Coworker</span>
          </label>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
          <DollarSign className="w-4 h-4 text-blue-400" /> เงินเดือน
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="เงินเดือนฐาน (บาท/เดือน)">
            <input
              type="number"
              value={form.baseSalary}
              onChange={(e) => set('baseSalary', parseFloat(e.target.value) || 0)}
              className={profileInputClass}
            />
          </FormField>
          {form.socialSecurity && (
            <div className="flex items-center p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-400">
              ประกันสังคม: ฿{Math.min(form.baseSalary * 0.05, 750).toFixed(0)}/เดือน
            </div>
          )}
        </div>
      </section>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 p-4 border-t border-white/10 bg-slate-950/95 backdrop-blur-md">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          บันทึกข้อมูลพนักงาน
        </button>
      </div>
    </div>
  )
}
