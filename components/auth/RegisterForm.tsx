'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { apiJson } from '@/lib/client-api'
import { Eye, EyeOff, Loader2, ChevronLeft, ChevronRight, Building2, Plus, Trash2 } from 'lucide-react'
import {
  DEFAULT_COMPANY_BRANCHES,
  registerBranchLabel,
  HQ_BRANCH_ID,
} from '@/lib/company-branches'
import { lineIdHint } from '@/lib/line-id-client'
import { englishOnlyFieldError, ENGLISH_ONLY_ERROR } from '@/lib/english-input'
import {
  validateRegisterPersonalStep,
  validateRegisterAddressStep,
  addressStepHasErrors,
  copyAddressIfSame,
  validateRegisterEmergencyContacts,
  emergencyContactsStepHasErrors,
  validateRegisterEmployeeStep,
  validateRegisterPasswordStep,
  MAX_REGISTER_EMERGENCY_CONTACTS,
  type RegisterAddress,
  type RegisterAddressStepErrors,
  type RegisterEmergencyContact,
  type RegisterEmergencyContactErrors,
} from '@/lib/register-form-validation'
import {
  saveRegisterDraft,
  loadRegisterDraft,
  clearRegisterDraft,
  type RegisterFormDraftFields,
} from '@/lib/register-form-storage'

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

const STEPS = ['ข้อมูลส่วนตัว', 'ที่อยู่', 'ผู้ติดต่อฉุกเฉิน', 'ข้อมูลพนักงาน', 'ตั้งรหัสผ่าน']

const MARITAL_STATUS_OPTIONS = ['โสด', 'สมรส', 'หย่าร้าง', 'หม้าย']

/** baseSalary/startDate are gone from this form entirely — HR sets both at
 *  approval time now (Phase 1 step 7's unified approve+org-assign modal),
 *  not the applicant. */
type FormData = {
  prefix: string; firstName: string; lastName: string; nickname: string
  email: string; phone: string; lineId: string; birthDate: string
  nationalId: string; nationality: string; maritalStatus: string
  role: string; branchId: string; socialSecurity: boolean
  password: string; confirmPassword: string
}

const EMPTY_ADDRESS: RegisterAddress = {
  houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '',
}

const EMPTY_CONTACT: RegisterEmergencyContact = { name: '', relationship: '', phone: '', altPhone: '' }

const ROLES = [
  { value: 'EMPLOYEE', label: '👤 พนักงาน',               desc: 'เข้าออกงาน, ขอลา, ดูสลิป' },
  { value: 'LAWYER',   label: '⚖️ ทนายความ',              desc: 'ส่งแผนงานรายสัปดาห์' },
]

const ADDRESS_FIELD_LABELS: { key: keyof RegisterAddress; label: string }[] = [
  { key: 'houseNo', label: 'บ้านเลขที่' },
  { key: 'moo', label: 'หมู่' },
  { key: 'soi', label: 'ซอย' },
  { key: 'road', label: 'ถนน' },
  { key: 'tambon', label: 'ตำบล/แขวง' },
  { key: 'amphoe', label: 'อำเภอ/เขต' },
  { key: 'province', label: 'จังหวัด' },
  { key: 'postalCode', label: 'รหัสไปรษณีย์' },
]

export default function RegisterForm() {
  const [step, setStep] = useState(0)
  const [loading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [showCPw, setShowCPw] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [addressErrors, setAddressErrors] = useState<RegisterAddressStepErrors>({ current: {}, registered: {} })
  const [contactErrors, setContactErrors] = useState<RegisterEmergencyContactErrors[]>([])
  const [branches, setBranches] = useState<BranchOption[]>(FALLBACK_BRANCHES)
  const [loadingBranches, setLoadingBranches] = useState(true)

  const [form, setForm] = useState<FormData>({
    prefix: 'นาย', firstName: '', lastName: '', nickname: '',
    email: '', phone: '', lineId: '', birthDate: '',
    nationalId: '', nationality: 'ไทย', maritalStatus: '',
    role: '', branchId: '', socialSecurity: true,
    password: '', confirmPassword: '',
  })
  const [currentAddress, setCurrentAddress] = useState<RegisterAddress>(EMPTY_ADDRESS)
  const [registeredAddress, setRegisteredAddress] = useState<RegisterAddress>(EMPTY_ADDRESS)
  const [sameAsCurrentAddress, setSameAsCurrentAddress] = useState(false)
  const [emergencyContacts, setEmergencyContacts] = useState<RegisterEmergencyContact[]>([{ ...EMPTY_CONTACT }])

  // Draft restore — client-only, runs once on mount.
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const draft = loadRegisterDraft(window.localStorage)
    if (!draft) return
    setStep(draft.step)
    setForm((f) => ({
      ...f,
      prefix: draft.prefix, firstName: draft.firstName, lastName: draft.lastName, nickname: draft.nickname,
      email: draft.email, phone: draft.phone, lineId: draft.lineId, birthDate: draft.birthDate,
      nationalId: draft.nationalId, nationality: draft.nationality, maritalStatus: draft.maritalStatus,
      role: draft.role, branchId: draft.branchId, socialSecurity: draft.socialSecurity,
    }))
    setCurrentAddress({
      houseNo: draft.currentHouseNo, moo: draft.currentMoo, soi: draft.currentSoi, road: draft.currentRoad,
      tambon: draft.currentTambon, amphoe: draft.currentAmphoe, province: draft.currentProvince, postalCode: draft.currentPostalCode,
    })
    setRegisteredAddress({
      houseNo: draft.regHouseNo, moo: draft.regMoo, soi: draft.regSoi, road: draft.regRoad,
      tambon: draft.regTambon, amphoe: draft.regAmphoe, province: draft.regProvince, postalCode: draft.regPostalCode,
    })
    setSameAsCurrentAddress(draft.sameAsCurrentAddress)
    if (draft.emergencyContacts.length) setEmergencyContacts(draft.emergencyContacts)
    toast.info('กู้คืนข้อมูลที่กรอกไว้ก่อนหน้านี้แล้ว')
  }, [])

  // Autosave — debounced so typing doesn't hit localStorage on every keystroke.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!restoredRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const effectiveRegistered = copyAddressIfSame(currentAddress, registeredAddress, sameAsCurrentAddress)
      const draft: RegisterFormDraftFields = {
        step,
        prefix: form.prefix, firstName: form.firstName, lastName: form.lastName, nickname: form.nickname,
        email: form.email, phone: form.phone, lineId: form.lineId, birthDate: form.birthDate,
        nationalId: form.nationalId, nationality: form.nationality, maritalStatus: form.maritalStatus,
        role: form.role, branchId: form.branchId, socialSecurity: form.socialSecurity,
        currentHouseNo: currentAddress.houseNo, currentMoo: currentAddress.moo, currentSoi: currentAddress.soi,
        currentRoad: currentAddress.road, currentTambon: currentAddress.tambon, currentAmphoe: currentAddress.amphoe,
        currentProvince: currentAddress.province, currentPostalCode: currentAddress.postalCode,
        sameAsCurrentAddress,
        regHouseNo: effectiveRegistered.houseNo, regMoo: effectiveRegistered.moo, regSoi: effectiveRegistered.soi,
        regRoad: effectiveRegistered.road, regTambon: effectiveRegistered.tambon, regAmphoe: effectiveRegistered.amphoe,
        regProvince: effectiveRegistered.province, regPostalCode: effectiveRegistered.postalCode,
        emergencyContacts,
      }
      saveRegisterDraft(draft, window.localStorage)
    }, 400)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [form, currentAddress, registeredAddress, sameAsCurrentAddress, emergencyContacts, step])

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

  /** Merges the existing English-only gate with validateRegisterPasswordStep's
   *  length/match check — English-only takes priority on whichever field it
   *  applies to (matches setEnglishField's prior behavior); recomputed on
   *  every keystroke of either field since confirmPassword's error depends
   *  on both. */
  const setPasswordField = (key: 'password' | 'confirmPassword', val: string) => {
    const nextPassword = key === 'password' ? val : form.password
    const nextConfirm = key === 'confirmPassword' ? val : form.confirmPassword
    setForm((f) => ({ ...f, [key]: val }))

    const pwErrs = validateRegisterPasswordStep({ password: nextPassword, confirmPassword: nextConfirm })
    setErrors((prev) => {
      const next = { ...prev }
      const passwordEngErr = englishOnlyFieldError(nextPassword)
      const confirmEngErr = englishOnlyFieldError(nextConfirm)
      if (passwordEngErr) next.password = passwordEngErr
      else if (pwErrs.password) next.password = pwErrs.password
      else delete next.password
      if (confirmEngErr) next.confirmPassword = confirmEngErr
      else if (pwErrs.confirmPassword) next.confirmPassword = pwErrs.confirmPassword
      else delete next.confirmPassword
      return next
    })
  }

  const setCurrentField = (key: keyof RegisterAddress, val: string) =>
    setCurrentAddress((a) => ({ ...a, [key]: val }))
  const setRegisteredField = (key: keyof RegisterAddress, val: string) =>
    setRegisteredAddress((a) => ({ ...a, [key]: val }))

  const setContactField = (index: number, key: keyof RegisterEmergencyContact, val: string) =>
    setEmergencyContacts((list) => list.map((c, i) => (i === index ? { ...c, [key]: val } : c)))
  const addContact = () =>
    setEmergencyContacts((list) => (list.length >= MAX_REGISTER_EMERGENCY_CONTACTS ? list : [...list, { ...EMPTY_CONTACT }]))
  const removeContact = (index: number) =>
    setEmergencyContacts((list) => list.filter((_, i) => i !== index))

  const next = () => {
    if (step === 0) {
      const e = validateRegisterPersonalStep({
        branchId: form.branchId, firstName: form.firstName, lastName: form.lastName,
        email: form.email, phone: form.phone, lineId: form.lineId, nationalId: form.nationalId,
      })
      setErrors((prev) => ({ ...prev, ...e }))
      if (Object.keys(e).length) return
    } else if (step === 1) {
      const result = validateRegisterAddressStep(currentAddress, registeredAddress, sameAsCurrentAddress)
      setAddressErrors(result)
      if (addressStepHasErrors(result)) return
    } else if (step === 2) {
      const errs = validateRegisterEmergencyContacts(emergencyContacts)
      setContactErrors(errs)
      if (emergencyContactsStepHasErrors(errs)) return
    } else if (step === 3) {
      const e = validateRegisterEmployeeStep({ role: form.role })
      setErrors((prev) => ({ ...prev, ...e }))
      if (Object.keys(e).length) return
    }
    setErrors({})
    setStep((s) => s + 1)
  }

  const back = () => { setErrors({}); setStep((s) => s - 1) }

  const handleSubmit = (e: React.FormEvent) => {
    // Registration is not wired to the backend yet — /api/register still
    // expects the old (pre-Phase-1) shape (baseSalary/startDate, a single
    // free-text address, no emergency contacts) and rebuilding it to accept
    // this form's shape is Phase 1 step 6's job, not this one's. Submitting
    // now would either 400 on the missing old required fields or silently
    // drop everything this step added — so the button stays disabled and
    // this handler is a no-op guard, not a real submit path.
    e.preventDefault()
  }

  const inputClass = (key: keyof FormData) =>
    `w-full rounded-xl border bg-slate-900/95 px-4 py-3 text-sm text-white placeholder-slate-400 outline-none transition-all focus:ring-2 focus:ring-green-500/50 ${errors[key] ? 'border-red-500/50' : 'border-white/10 focus:border-green-500/50'}`

  const addressInputClass = (err?: string) =>
    `w-full rounded-xl border bg-slate-900/95 px-4 py-3 text-sm text-white placeholder-slate-400 outline-none transition-all focus:ring-2 focus:ring-green-500/50 ${err ? 'border-red-500/50' : 'border-white/10 focus:border-green-500/50'}`

  const renderAddressFields = (
    address: RegisterAddress,
    setField: (key: keyof RegisterAddress, val: string) => void,
    fieldErrors: Partial<Record<keyof RegisterAddress, string>>,
    idPrefix: string,
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {ADDRESS_FIELD_LABELS.map(({ key, label }) => (
        <div key={key} className="space-y-1.5 min-w-0">
          <label htmlFor={`${idPrefix}-${key}`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">{label} *</label>
          <input
            id={`${idPrefix}-${key}`}
            type="text"
            className={addressInputClass(fieldErrors[key])}
            value={address[key]}
            onChange={(e) => setField(key, e.target.value)}
          />
          {fieldErrors[key] && <p className="text-xs text-red-400">{fieldErrors[key]}</p>}
        </div>
      ))}
    </div>
  )

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
              <label htmlFor="field-9" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">เลขบัตรประชาชน *</label>
              <input id="field-9" type="text" placeholder="1234567890123" maxLength={13} className={inputClass('nationalId')} value={form.nationalId} onChange={(e) => set('nationalId', e.target.value.replace(/\D/g, '').slice(0, 13))} />
              {errors.nationalId && <p className="text-xs text-red-400">{errors.nationalId}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="field-13" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">สัญชาติ</label>
              <input id="field-13" type="text" className={inputClass('nationality')} value={form.nationality} onChange={(e) => set('nationality', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="field-14" className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">สถานภาพสมรส</label>
              <select id="field-14" value={form.maritalStatus} onChange={(e) => set('maritalStatus', e.target.value)} className={inputClass('maritalStatus')}>
                <option value="">ไม่ระบุ</option>
                {MARITAL_STATUS_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* STEP 1: Address */}
      {step === 1 && (
        <div className="space-y-5 animate-fade-in">
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">ที่อยู่ปัจจุบัน</h3>
            {renderAddressFields(currentAddress, setCurrentField, addressErrors.current, 'cur')}
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3.5 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={sameAsCurrentAddress}
              onChange={(e) => setSameAsCurrentAddress(e.target.checked)}
              className="accent-green-500 h-4 w-4"
            />
            ที่อยู่ตามทะเบียนบ้านเหมือนที่อยู่ปัจจุบัน
          </label>

          {!sameAsCurrentAddress && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">ที่อยู่ตามทะเบียนบ้าน</h3>
              {renderAddressFields(registeredAddress, setRegisteredField, addressErrors.registered, 'reg')}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Emergency Contacts */}
      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          <p className="text-xs text-slate-400 light:text-slate-600">กรุณาระบุผู้ติดต่อฉุกเฉินอย่างน้อย 1 คน (เพิ่มได้สูงสุด {MAX_REGISTER_EMERGENCY_CONTACTS} คน)</p>
          {emergencyContacts.map((contact, i) => {
            const err = contactErrors[i] ?? {}
            return (
              <div key={i} className="space-y-3 rounded-xl border border-white/10 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ผู้ติดต่อฉุกเฉิน #{i + 1}</span>
                  {emergencyContacts.length > 1 && (
                    <button type="button" onClick={() => removeContact(i)} className="text-red-400 hover:text-red-300 p-1" aria-label="ลบผู้ติดต่อฉุกเฉินคนนี้">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor={`contact-${i}-name`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ชื่อ-นามสกุล *</label>
                    <input id={`contact-${i}-name`} type="text" className={addressInputClass(err.name)} value={contact.name} onChange={(e) => setContactField(i, 'name', e.target.value)} />
                    {err.name && <p className="text-xs text-red-400">{err.name}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`contact-${i}-rel`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ความสัมพันธ์ *</label>
                    <input id={`contact-${i}-rel`} type="text" placeholder="เช่น บิดา, มารดา, คู่สมรส" className={addressInputClass(err.relationship)} value={contact.relationship} onChange={(e) => setContactField(i, 'relationship', e.target.value)} />
                    {err.relationship && <p className="text-xs text-red-400">{err.relationship}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`contact-${i}-phone`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">เบอร์โทร *</label>
                    <input id={`contact-${i}-phone`} type="tel" placeholder="0812345678" className={addressInputClass(err.phone)} value={contact.phone} onChange={(e) => setContactField(i, 'phone', e.target.value.replace(/\D/g, '').slice(0, 10))} />
                    {err.phone && <p className="text-xs text-red-400">{err.phone}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`contact-${i}-alt`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">เบอร์สำรอง</label>
                    <input id={`contact-${i}-alt`} type="tel" placeholder="ไม่บังคับ" className={addressInputClass()} value={contact.altPhone} onChange={(e) => setContactField(i, 'altPhone', e.target.value.replace(/\D/g, '').slice(0, 10))} />
                  </div>
                </div>
              </div>
            )
          })}
          {emergencyContacts.length < MAX_REGISTER_EMERGENCY_CONTACTS && (
            <button type="button" onClick={addContact} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 py-2.5 text-sm text-slate-300 hover:border-white/40 hover:text-white transition-all">
              <Plus size={15} /> เพิ่มผู้ติดต่อฉุกเฉิน
            </button>
          )}
        </div>
      )}

      {/* STEP 3: Employee Info */}
      {step === 3 && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
            สาขา: {branches.find((b) => b.id === form.branchId)?.label ?? '—'} — ฝ่าย/แผนก/ส่วนงาน/เงินเดือน/วันเริ่มงาน HR จะกำหนดหลังอนุมัติบัญชี
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

      {/* STEP 4: Password */}
      {step === 4 && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-sm text-slate-300">
            <p className="font-semibold text-white mb-1">สรุปข้อมูล</p>
            <p>ชื่อ: {form.prefix}{form.firstName} {form.lastName} ({form.nickname || '-'})</p>
            <p>อีเมล: {form.email}</p>
            <p>สาขา: {branches.find((b) => b.id === form.branchId)?.label ?? '—'}</p>
            <p>ตำแหน่ง/Role: {ROLES.find(r => r.value === form.role)?.label ?? '-'}</p>
            <p>ผู้ติดต่อฉุกเฉิน: {emergencyContacts.length} คน</p>
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
                onChange={(e) => setPasswordField('password', e.target.value)}
              />
              <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
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
                onChange={(e) => setPasswordField('confirmPassword', e.target.value)}
              />
              <button type="button" onClick={() => setShowCPw(v => !v)} aria-label={showCPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showCPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-xs text-red-400">{errors.confirmPassword}</p>}
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200/90">
            <p className="font-semibold">🚧 ระบบสมัครยังไม่เปิดใช้งาน</p>
            <p className="mt-1">หน้านี้อยู่ระหว่างปรับปรุง (Phase 1) — ปุ่มส่งคำขอสมัครจะเปิดใช้งานเมื่อระบบหลังบ้านพร้อมรองรับข้อมูลชุดใหม่ทั้งหมด</p>
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
          <button type="submit" disabled className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-700 py-3 text-sm font-semibold text-slate-400 cursor-not-allowed opacity-70">
            {loading ? <Loader2 size={16} className="animate-spin" /> : null} ระบบสมัครจะเปิดใช้งานเร็วๆ นี้
          </button>
        )}
      </div>
    </form>
  )
}

/** Exposed for step 6 — clears the autosaved draft once real submission
 *  ships and a registration actually succeeds. Not called anywhere yet. */
export function clearRegisterFormDraft() {
  clearRegisterDraft(window.localStorage)
}
