'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { Eye, EyeOff, Loader2, ChevronLeft, ChevronRight, Building2 } from 'lucide-react'
import {
  DEFAULT_COMPANY_BRANCHES,
  registerBranchLabel,
  HQ_BRANCH_ID,
} from '@/lib/company-branches'
import { isValidLineIdInput, lineIdHint } from '@/lib/line-id-client'
import { englishOnlyFieldError, ENGLISH_ONLY_ERROR, isEnglishOnly } from '@/lib/english-input'

type BranchOption = {
  id: string
  name: string
  code: string
  registerTag: string
  label: string
}

const FALLBACK_BRANCHES: BranchOption[] = DEFAULT_COMPANY_BRANCHES.map((b) => ({
  id: b.id,
  name: b.name,
  code: b.code,
  registerTag: b.registerTag,
  label: registerBranchLabel(b.name, b.registerTag),
}))

const STEPS = ['ข้อมูลส่วนตัว', 'ข้อมูลพนักงาน', 'ตั้งรหัสผ่าน']

type FormData = {
  prefix: string; firstName: string; lastName: string; nickname: string
  email: string; phone: string; lineId: string; birthDate: string; address: string
  nationalId: string; role: string; branchId: string
  baseSalary: string; startDate: string; socialSecurity: boolean
  password: string; confirmPassword: string
}

const ROLES = [
  { value: 'EMPLOYEE', label: '👤 พนักงาน',               desc: 'เข้าออกงาน, ขอลา, ดูสลิป' },
  { value: 'LAWYER',   label: '⚖️ ทนายความ',              desc: 'ส่งแผนงานรายสัปดาห์' },
]

export default function RegisterForm() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [showCPw, setShowCPw] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [branches, setBranches] = useState<BranchOption[]>(FALLBACK_BRANCHES)
  const [loadingBranches, setLoadingBranches] = useState(true)

  useEffect(() => {
    apiJson<{
      branches?: {
        id: string
        name: string
        code: string
        registerTag?: string
        label?: string
      }[]
    }>('/api/branches/public')
      .then(({ ok, data }) => {
        const list =
          ok && data.branches?.length
            ? data.branches.map((b) => {
                const registerTag =
                  b.registerTag ?? (b.code === 'HQ' ? 'สาขาหลัก' : 'สาขาย่อย')
                return {
                  id: b.id,
                  name: b.name,
                  code: b.code,
                  registerTag,
                  label: b.label ?? registerBranchLabel(b.name, registerTag),
                }
              })
            : FALLBACK_BRANCHES
        setBranches(list)
        const def = list.find((b) => b.code === 'HQ') ?? list[0]
        setForm((f) => (f.branchId ? f : { ...f, branchId: def.id }))
      })
      .catch(() => {
        setBranches(FALLBACK_BRANCHES)
        setForm((f) => (f.branchId ? f : { ...f, branchId: HQ_BRANCH_ID }))
      })
      .finally(() => setLoadingBranches(false))
  }, [])

  const [form, setForm] = useState<FormData>({
    prefix: 'นาย', firstName: '', lastName: '', nickname: '',
    email: '', phone: '', lineId: '', birthDate: '', address: '', nationalId: '',
    role: '', branchId: '', baseSalary: '', startDate: '', socialSecurity: true,
    password: '', confirmPassword: '',
  })

  const set = (key: keyof FormData, val: string | boolean) =>
    setForm((f) => ({ ...f, [key]: val }))

  const setEnglishField = (key: 'email' | 'password' | 'confirmPassword', val: string) => {
    setForm((f) => ({ ...f, [key]: val }))
    const msg = englishOnlyFieldError(val)
    if (msg) setErrors((prev) => ({ ...prev, [key]: msg }))
    else setErrors((prev) => {
      const next = { ...prev }
      if (next[key] === ENGLISH_ONLY_ERROR) delete next[key]
      return next
    })
  }

  const validateStep = (s: number): Partial<Record<keyof FormData, string>> => {
    const e: Partial<Record<keyof FormData, string>> = {}
    if (s === 0) {
      if (!form.branchId)   e.branchId   = 'กรุณาเลือกสาขา'
      if (!form.firstName) e.firstName = 'กรุณากรอกชื่อจริง'
      if (!form.lastName)  e.lastName  = 'กรุณากรอกนามสกุล'
      if (!form.email)     e.email     = 'กรุณากรอกอีเมล'
      else if (!isEnglishOnly(form.email)) e.email = ENGLISH_ONLY_ERROR
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'รูปแบบอีเมลไม่ถูกต้อง'
      if (!form.phone)     e.phone     = 'กรุณากรอกเบอร์โทร'
      else if (!/^0[0-9]{9}$/.test(form.phone.replace(/\D/g, ''))) e.phone = 'เบอร์ 10 หลัก เช่น 0812345678'
      if (!form.lineId.trim()) e.lineId = 'กรุณากรอก LINE ID'
      else if (!isValidLineIdInput(form.lineId)) e.lineId = lineIdHint()
    }
    if (s === 1) {
      if (!form.role)       e.role       = 'กรุณาเลือกตำแหน่ง'
      if (!form.startDate)  e.startDate  = 'กรุณาเลือกวันที่เริ่มงาน'
    }
    if (s === 2) {
      if (!form.password)         e.password        = 'กรุณากรอกรหัสผ่าน'
      else if (!isEnglishOnly(form.password)) e.password = ENGLISH_ONLY_ERROR
      else if (form.password.length < 8) e.password  = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'
      if (!isEnglishOnly(form.confirmPassword)) e.confirmPassword = ENGLISH_ONLY_ERROR
      else if (form.password !== form.confirmPassword) e.confirmPassword = 'รหัสผ่านไม่ตรงกัน'
    }
    return e
  }

  const next = () => {
    const e = validateStep(step)
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setStep((s) => s + 1)
  }

  const back = () => { setErrors({}); setStep((s) => s - 1) }

  const buildPayload = () => {
    const phone = form.phone.replace(/\D/g, '')
    const baseSalaryNum = form.baseSalary.trim() ? parseFloat(form.baseSalary) : null
    return {
      prefix: form.prefix,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      nickname: form.nickname.trim() || undefined,
      email: form.email.trim().toLowerCase(),
      phone,
      lineId: form.lineId.trim(),
      birthDate: form.birthDate || undefined,
      address: form.address.trim() || undefined,
      nationalId: form.nationalId.trim() || undefined,
      role: form.role as 'EMPLOYEE' | 'LAWYER',
      branchId: form.branchId,
      baseSalary: baseSalaryNum != null && !Number.isNaN(baseSalaryNum) ? baseSalaryNum : null,
      startDate: form.startDate,
      socialSecurity: form.socialSecurity,
      password: form.password,
      name: `${form.prefix}${form.firstName.trim()} ${form.lastName.trim()}`.replace(/\s+/g, ' ').trim(),
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const allErrors = { ...validateStep(0), ...validateStep(1), ...validateStep(2) }
    if (Object.keys(allErrors).length) {
      setErrors(allErrors)
      const firstStep = allErrors.branchId || allErrors.firstName || allErrors.lastName || allErrors.email || allErrors.phone || allErrors.lineId
        ? 0
        : allErrors.role || allErrors.startDate
          ? 1
          : 2
      setStep(firstStep)
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วน')
      return
    }

    setLoading(true)
    try {
      const { ok, data, status } = await apiJson<{ success?: boolean; message?: string }>(
        '/api/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        },
      )

      if (!ok) {
        if (status === 0) {
          toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ — ตรวจสอบว่า npm run dev ยังรันอยู่')
        } else {
          toast.error(apiErrorMessage(data, 'สมัครไม่สำเร็จ', status))
        }
        return
      }

      toast.success('สมัครเรียบร้อย! กรุณารอ HR อนุมัติ (1-2 วันทำการ)')
      setTimeout(() => router.push('/?status=pending'), 1500)
    } catch (err) {
      console.error('[register]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = (key: keyof FormData) =>
    `w-full rounded-xl border bg-slate-900/95 px-4 py-3 text-sm text-white placeholder-slate-400 outline-none transition-all focus:ring-2 focus:ring-green-500/50 ${errors[key] ? 'border-red-500/50' : 'border-white/10 focus:border-green-500/50'}`

  return (
    <form onSubmit={handleSubmit}>
      {/* Step indicator */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2 min-w-0">
            <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-xs transition-colors truncate ${i === step ? 'text-white font-semibold' : 'text-slate-500'}`}>{s}</span>
            {i < STEPS.length - 1 && <div className={`hidden sm:block h-px flex-1 transition-all ${i < step ? 'bg-green-500/50' : 'bg-slate-700'}`} />}
          </div>
        ))}
      </div>

      {/* STEP 0: Personal Info */}
      {step === 0 && (
        <div className="space-y-4 animate-fade-in">
          <fieldset className="space-y-2 border-0 p-0 m-0">
            <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600 flex items-center gap-1.5">
              <Building2 size={14} className="text-green-400" />
              เลือกสาขาที่สังกัด *
            </legend>
            {loadingBranches ? (
              <p className="text-sm text-slate-500 py-2">กำลังโหลดรายการสาขา...</p>
            ) : (
              <div className="grid gap-2">
                {branches.map((b) => (
                  <label
                    key={b.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                      form.branchId === b.id
                        ? 'border-green-500/50 bg-green-500/10'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="branchId"
                      value={b.id}
                      checked={form.branchId === b.id}
                      onChange={(e) => set('branchId', e.target.value)}
                      className="accent-green-500 mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white leading-snug">{b.name}</p>
                      <p className="text-xs text-green-300/90 mt-0.5">({b.registerTag})</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {errors.branchId && <p className="text-xs text-red-400">{errors.branchId}</p>}
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 min-w-0">
              <label htmlFor="field-1" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">คำนำหน้า</label>
              <select id="field-1" value={form.prefix} onChange={(e) => set('prefix', e.target.value)} className={inputClass('prefix')}>
                {['นาย', 'นาง', 'นางสาว', 'ดร.', 'อื่นๆ'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 space-y-1.5 min-w-0">
              <label htmlFor="field-2" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ชื่อจริง *</label>
              <input id="field-2" type="text" placeholder="ชื่อจริง" className={inputClass('firstName')} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
              {errors.firstName && <p className="text-xs text-red-400">{errors.firstName}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 min-w-0">
              <label htmlFor="field-3" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">นามสกุล *</label>
              <input id="field-3" type="text" placeholder="นามสกุล" className={inputClass('lastName')} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
              {errors.lastName && <p className="text-xs text-red-400">{errors.lastName}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="field-4" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ชื่อเล่น</label>
              <input id="field-4" type="text" placeholder="ชื่อเล่น" className={inputClass('nickname')} value={form.nickname} onChange={(e) => set('nickname', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="field-5" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">อีเมล *</label>
              <input id="field-5" type="email" placeholder="name@company.com" className={inputClass('email')} value={form.email} onChange={(e) => setEnglishField('email', e.target.value)} />
              {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="field-6" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">เบอร์โทร *</label>
              <input id="field-6"
                type="tel"
                placeholder="0812345678"
                className={inputClass('phone')}
                value={form.phone}
                onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
              {errors.phone && <p className="text-xs text-red-400">{errors.phone}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="field-7" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">LINE ID *</label>
            <input id="field-7"
              type="text"
              placeholder="@username"
              className={inputClass('lineId')}
              value={form.lineId}
              onChange={(e) => set('lineId', e.target.value)}
              autoComplete="off"
            />
            <p className="text-[11px] text-slate-500">{lineIdHint()} — ใช้รับแจ้งเตือนจาก HR</p>
            {errors.lineId && <p className="text-xs text-red-400">{errors.lineId}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="field-8" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">วันเกิด</label>
              <input id="field-8" type="date" className={inputClass('birthDate')} value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="field-9" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">เลขบัตรประชาชน</label>
              <input id="field-9" type="text" placeholder="1234567890123 (optional)" className={inputClass('nationalId')} value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="field-10" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ที่อยู่</label>
            <textarea id="field-10" placeholder="ที่อยู่ปัจจุบัน..." rows={2} className={`${inputClass('address')} resize-none py-2.5`} value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
        </div>
      )}

      {/* STEP 1: Employee Info */}
      {step === 1 && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
            สาขา: {branches.find((b) => b.id === form.branchId)?.label ?? '—'} — ฝ่าย/แผนก/ส่วนงาน HR จะกำหนดหลังอนุมัติบัญชี
          </div>

          <fieldset className="space-y-2 border-0 p-0 m-0">
            <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ตำแหน่ง / Role *</legend>
            <div className="grid gap-2">
              {ROLES.map((r) => (
                <label key={r.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-all ${form.role === r.value ? 'border-green-500/50 bg-green-500/10' : 'border-white/10 hover:border-white/20'}`}>
                  <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={(e) => set('role', e.target.value)} className="accent-green-500" />
                  <div>
                    <p className="text-sm font-semibold text-white">{r.label}</p>
                    <p className="text-xs text-slate-400 light:text-slate-600">{r.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            {errors.role && <p className="text-xs text-red-400">{errors.role}</p>}
          </fieldset>

          <div className="space-y-1.5">
            <label htmlFor="field-11" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">เงินเดือนพื้นฐาน (ถ้ามี)</label>
            <input id="field-11" type="number" placeholder="25000" className={inputClass('baseSalary')} value={form.baseSalary} onChange={(e) => set('baseSalary', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="field-12" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">วันที่เริ่มงาน *</label>
            <input id="field-12" type="date" className={inputClass('startDate')} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            {errors.startDate && <p className="text-xs text-red-400">{errors.startDate}</p>}
          </div>

          <fieldset className="space-y-1.5 border-0 p-0 m-0">
            <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">สถานะประกันสังคม</legend>
            <div className="flex flex-col sm:flex-row gap-3">
              {[{ val: true, label: '✅ อยู่ในประกันสังคม' }, { val: false, label: '❌ ไม่อยู่ในประกันสังคม' }].map(({ val, label }) => (
                <label key={String(val)} className={`flex flex-1 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition-all min-h-[44px] ${form.socialSecurity === val ? 'border-green-500/50 bg-green-500/10 text-white light:text-slate-900' : 'border-white/10 text-slate-400 light:text-slate-600 hover:border-white/20'}`}>
                  <input type="radio" name="ss" checked={form.socialSecurity === val} onChange={() => set('socialSecurity', val)} className="accent-green-500" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {/* STEP 2: Password */}
      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-sm text-slate-300">
            <p className="font-semibold text-white mb-1">สรุปข้อมูล</p>
            <p>ชื่อ: {form.prefix}{form.firstName} {form.lastName} ({form.nickname || '-'})</p>
            <p>อีเมล: {form.email}</p>
            <p>สาขา: {branches.find((b) => b.id === form.branchId)?.label ?? '—'}</p>
            <p>ตำแหน่ง/Role: {ROLES.find(r => r.value === form.role)?.label ?? '-'}</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password-field" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">รหัสผ่าน *</label>
            <div className="relative">
              <input
                id="password-field"
                type={showPw ? 'text' : 'password'}
                placeholder="อย่างน้อย 8 ตัวอักษร"
                className={`${inputClass('password')} pr-11`}
                value={form.password}
                onChange={(e) => setEnglishField('password', e.target.value)}
              />
              <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
            {/* Strength indicator */}
            {form.password && (
              <div className="flex gap-1 mt-1.5">
                {[8, 12, 16].map((len, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-all ${form.password.length >= len ? ['bg-red-500', 'bg-yellow-500', 'bg-green-500'][i] : 'bg-slate-700'}`} />
                ))}
                <span className="ml-1 text-[12px] text-slate-400 light:text-slate-600">{form.password.length < 8 ? 'อ่อนแอ' : form.password.length < 12 ? 'ปานกลาง' : 'แข็งแกร่ง'}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirm-password-field" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ยืนยันรหัสผ่าน *</label>
            <div className="relative">
              <input
                id="confirm-password-field"
                type={showCPw ? 'text' : 'password'}
                placeholder="••••••••"
                className={`${inputClass('confirmPassword')} pr-11`}
                value={form.confirmPassword}
                onChange={(e) => setEnglishField('confirmPassword', e.target.value)}
              />
              <button type="button" onClick={() => setShowCPw(v => !v)} aria-label={showCPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showCPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-xs text-red-400">{errors.confirmPassword}</p>}
          </div>

          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 text-xs text-slate-400 light:text-slate-600">
            <p>✅ หลังสมัคร บัญชีจะอยู่ในสถานะ <strong className="text-yellow-400">รอการอนุมัติ</strong></p>
            <p className="mt-1">✅ HR / Manager จะตรวจสอบและแจ้งผลทาง LINE หรืออีเมล</p>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <button type="button" onClick={back} className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white light:text-slate-900 hover:bg-white/10 transition-all">
            <ChevronLeft size={16} /> ย้อนกลับ
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-500 transition-all">
            ถัดไป <ChevronRight size={16} />
          </button>
        ) : (
          <button type="submit" disabled={loading} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-500 transition-all disabled:opacity-60">
            {loading ? <><Loader2 size={16} className="animate-spin" /> กำลังส่ง...</> : '✅ ส่งคำขอสมัคร'}
          </button>
        )}
      </div>
    </form>
  )
}
