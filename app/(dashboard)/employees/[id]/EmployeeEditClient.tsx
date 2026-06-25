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
  Settings,
  Clock,
  FileText,
  CheckSquare,
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
import { EMPLOYEE_TYPES } from '@/lib/rbac'
import { USER_STATUS_LABEL as STATUS_LABELS } from '@/lib/status-labels'

type Employee = {
  id: string
  name: string
  email: string
  employeeId: string | null
  role: string
  status: string
  employeeType: string | null
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
  addressIdCard: string | null
  nationalId: string | null
  warningCount: number
}

const ROLES = [
  'EMPLOYEE',
  'LAWYER',
  'ENFORCEMENT',
  'TEAM_LEADER',
  'MANAGER',
  'HR',
  'MANAGER_HR',
  'ADMIN',
  'SUPER_ADMIN',
]
const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE:    'พนักงาน',
  LAWYER:      'ทนายความ',
  ENFORCEMENT: 'เจ้าหน้าที่บังคับคดี',
  TEAM_LEADER: 'หัวหน้าทีม',
  MANAGER:     'ผู้จัดการ',
  HR:          'ฝ่ายบุคคล (HR)',
  MANAGER_HR:  'ผู้จัดการ / HR',
  ADMIN:       'Admin',
  SUPER_ADMIN: 'Super Admin',
}
const STATUS_LIST = ['ACTIVE', 'PENDING', 'DISABLED', 'REJECTED']

type TabKey = 'profile' | 'work' | 'system'
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
  const [activeTab, setActiveTab] = useState<TabKey>('profile')
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
    employeeType: employee.employeeType ?? 'permanent_employee',
    baseSalary: employee.baseSalary,
    socialSecurity: employee.socialSecurity,
    isCoworker: employee.isCoworker,
    startDate: employee.startDate ? employee.startDate.substring(0, 10) : '',
    birthDate: employee.birthDate ? employee.birthDate.substring(0, 10) : '',
    address: employee.address ?? '',
    addressIdCard: employee.addressIdCard ?? '',
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
      const firstErrorTab = Object.keys(v).some(k => ['name','email','phone','nationalId','birthDate'].includes(k))
        ? 'profile'
        : Object.keys(v).some(k => ['lineId'].includes(k))
        ? 'system'
        : 'work'
      setActiveTab(firstErrorTab)
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
        addressIdCard: form.addressIdCard.trim() || null,
        birthDate: form.birthDate || null,
        nationalId: form.nationalId.replace(/\D/g, '') || null,
        lineId: form.lineId,
        lineUserId: form.lineUserId,
        lineDisplayName: form.lineDisplayName,
        department: form.department,
        position: form.position,
        employeeType: form.employeeType,
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

  const tabs: { key: TabKey; label: string; hasError: boolean }[] = [
    {
      key: 'profile',
      label: 'ทั่วไป',
      hasError: Object.keys(errors).some(k => ['name','email','phone','nationalId','birthDate'].includes(k)),
    },
    { key: 'work', label: 'การทำงาน', hasError: false },
    {
      key: 'system',
      label: 'ระบบ & สิทธิ์',
      hasError: Object.keys(errors).some(k => ['lineId'].includes(k)),
    },
  ]

  const quickLinks = [
    { href: `/attendance/monthly?userId=${employee.id}`, label: 'เวลาทำงาน', Icon: Clock },
    { href: `/leave-history?userId=${employee.id}`, label: 'ประวัติลา', Icon: FileText },
    { href: `/warnings?userId=${employee.id}`, label: 'ใบเตือน', Icon: AlertTriangle },
    { href: `/tasks?assigneeId=${employee.id}`, label: 'งานที่รับผิดชอบ', Icon: CheckSquare },
  ]

  return (
    <div className="p-4 md:p-6 lg:p-8 pb-28 md:pb-8 space-y-4">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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

      {/* ── Quick links to employee data ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {quickLinks.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition text-[13px] font-medium"
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Link>
        ))}
      </div>

      {/* ── Banners ── */}
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

      {/* ── Tab navigation ── */}
      <div className="flex gap-1 rounded-2xl bg-white/[0.04] p-1 border border-white/[0.07]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`relative flex-1 py-2.5 rounded-xl text-[14px] font-semibold transition-all ${
              activeTab === t.key
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            {t.label}
            {t.hasError && (
              <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-red-400" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: ทั่วไป ── */}
      {activeTab === 'profile' && (
        <div className="space-y-4">
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
            <FormField label="ที่อยู่ปัจจุบัน">
              <textarea
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                rows={2}
                placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด"
                className={`${profileInputClass} resize-none`}
              />
            </FormField>
            <FormField label="ที่อยู่ตามบัตรประชาชน">
              <textarea
                value={form.addressIdCard}
                onChange={(e) => set('addressIdCard', e.target.value)}
                rows={2}
                placeholder="ที่อยู่ตามบัตรประชาชน (ถ้าต่างจากที่อยู่ปัจจุบัน)"
                className={`${profileInputClass} resize-none`}
              />
            </FormField>
          </section>
        </div>
      )}

      {/* ── Tab: การทำงาน ── */}
      {activeTab === 'work' && (
        <div className="space-y-4">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="วันเริ่มงาน">
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set('startDate', e.target.value)}
                  className={profileInputClass}
                />
              </FormField>
              <FormField label="ประเภทพนักงาน">
                <select
                  value={form.employeeType}
                  onChange={(e) => set('employeeType', e.target.value)}
                  className={profileInputClass}
                >
                  {EMPLOYEE_TYPES.map((t) => (
                    <option key={t.value} value={t.value} className="bg-slate-900">
                      {t.label}
                    </option>
                  ))}
                </select>
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
        </div>
      )}

      {/* ── Tab: ระบบ & สิทธิ์ ── */}
      {activeTab === 'system' && (
        <div className="space-y-4">
          <section className="glass-card rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
              <Settings className="w-4 h-4 text-violet-400" /> สิทธิ์การใช้งาน
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Role (ตำแหน่งในระบบ)">
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
              <FormField label="สถานะบัญชี">
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
            </div>
            {isSelf && (
              <p className="text-[12px] text-amber-400/80">
                ไม่สามารถเปลี่ยน Role/สถานะตัวเองได้ — ให้ Admin คนอื่นดำเนินการ
              </p>
            )}
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
        </div>
      )}

      {/* ── Mobile save button ── */}
      <div
        className="md:hidden fixed left-0 right-0 z-[45] p-4 border-t border-white/10 bg-slate-950/95 backdrop-blur-md"
        style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
      >
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
