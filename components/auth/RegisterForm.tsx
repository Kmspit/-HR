'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { Eye, EyeOff, Loader2, ChevronLeft, ChevronRight, Building2, Plus, Trash2 } from 'lucide-react'
import {
  DEFAULT_COMPANY_BRANCHES,
  registerBranchLabel,
  HQ_BRANCH_ID,
} from '@/lib/company-branches'
import { lineIdHint } from '@/lib/line-id-client'
import { englishOnlyFieldError, ENGLISH_ONLY_ERROR } from '@/lib/english-input'
import { THAI_BANKS } from '@/lib/thai-banks'
import { MARITAL_STATUS_OPTIONS } from '@/lib/marital-status'
import { ADDRESS_FIELD_LABELS } from '@/lib/address-field-labels'
import {
  validateRegisterPersonalStep,
  validateRegisterAddressStep,
  addressStepHasErrors,
  copyAddressIfSame,
  validateRegisterEmergencyContacts,
  emergencyContactsStepHasErrors,
  validateRegisterDependents,
  dependentsStepHasErrors,
  validateRegisterBankAccounts,
  bankAccountsStepHasErrors,
  validateRegisterEmployeeStep,
  validateRegisterPasswordStep,
  MAX_REGISTER_EMERGENCY_CONTACTS,
  DEPENDENT_RELATION_TYPES,
  type RegisterAddress,
  type RegisterAddressStepErrors,
  type RegisterEmergencyContact,
  type RegisterEmergencyContactErrors,
  type RegisterDependent,
  type RegisterDependentErrors,
  type RegisterBankAccount,
  type RegisterBankAccountErrors,
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

const STEPS = ['ข้อมูลส่วนตัว', 'ที่อยู่', 'ผู้ติดต่อฉุกเฉิน', 'ผู้อยู่ในอุปการะ', 'บัญชีธนาคาร', 'ข้อมูลพนักงาน', 'ตั้งรหัสผ่าน']

const DEPENDENT_RELATION_LABELS: Record<(typeof DEPENDENT_RELATION_TYPES)[number], string> = {
  SPOUSE: 'คู่สมรส',
  CHILD: 'บุตร',
  PARENT: 'บิดา/มารดา',
  OTHER: 'อื่นๆ',
}

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

const EMPTY_DEPENDENT: RegisterDependent = { name: '', relationType: '', birthDate: '', nationalId: '', isTaxAllowance: false }

const EMPTY_BANK_ACCOUNT: RegisterBankAccount = { bankCode: '', accountNumber: '', accountName: '', accountType: '', isPrimary: false }

const MAX_REGISTER_DEPENDENTS = 10
const MAX_REGISTER_BANK_ACCOUNTS = 5

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
  const [addressErrors, setAddressErrors] = useState<RegisterAddressStepErrors>({ current: {}, registered: {} })
  const [contactErrors, setContactErrors] = useState<RegisterEmergencyContactErrors[]>([])
  const [dependentErrors, setDependentErrors] = useState<RegisterDependentErrors[]>([])
  const [bankAccountErrors, setBankAccountErrors] = useState<RegisterBankAccountErrors[]>([])
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
  const [dependents, setDependents] = useState<RegisterDependent[]>([])
  const [bankAccounts, setBankAccounts] = useState<RegisterBankAccount[]>([])

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
    setDependents(draft.dependents as RegisterDependent[])
    setBankAccounts(draft.bankAccounts as RegisterBankAccount[])
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
        dependents,
        bankAccounts,
      }
      saveRegisterDraft(draft, window.localStorage)
    }, 400)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [form, currentAddress, registeredAddress, sameAsCurrentAddress, emergencyContacts, dependents, bankAccounts, step])

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

  const setDependentField = (index: number, key: keyof RegisterDependent, val: string | boolean) =>
    setDependents((list) => list.map((d, i) => (i === index ? { ...d, [key]: val } : d)))
  const addDependent = () =>
    setDependents((list) => (list.length >= MAX_REGISTER_DEPENDENTS ? list : [...list, { ...EMPTY_DEPENDENT }]))
  const removeDependent = (index: number) =>
    setDependents((list) => list.filter((_, i) => i !== index))

  const setBankAccountField = (index: number, key: keyof RegisterBankAccount, val: string | boolean) =>
    setBankAccounts((list) => list.map((b, i) => (i === index ? { ...b, [key]: val } : b)))
  const addBankAccount = () =>
    setBankAccounts((list) => (list.length >= MAX_REGISTER_BANK_ACCOUNTS ? list : [...list, { ...EMPTY_BANK_ACCOUNT, isPrimary: list.length === 0 }]))
  const removeBankAccount = (index: number) =>
    setBankAccounts((list) => list.filter((_, i) => i !== index))
  /** Only one account can be primary — selecting a new one clears the rest. */
  const setPrimaryBankAccount = (index: number) =>
    setBankAccounts((list) => list.map((b, i) => ({ ...b, isPrimary: i === index })))

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
      const errs = validateRegisterDependents(dependents)
      setDependentErrors(errs)
      if (dependentsStepHasErrors(errs)) return
    } else if (step === 4) {
      const errs = validateRegisterBankAccounts(bankAccounts)
      setBankAccountErrors(errs)
      if (bankAccountsStepHasErrors(errs)) return
    } else if (step === 5) {
      const e = validateRegisterEmployeeStep({ role: form.role })
      setErrors((prev) => ({ ...prev, ...e }))
      if (Object.keys(e).length) return
    }
    setErrors({})
    setStep((s) => s + 1)
  }

  const back = () => { setErrors({}); setStep((s) => s - 1) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const passwordErrs = validateRegisterPasswordStep({ password: form.password, confirmPassword: form.confirmPassword })
    if (Object.keys(passwordErrs).length) {
      setErrors((prev) => ({ ...prev, ...passwordErrs }))
      toast.error('กรุณาตรวจสอบรหัสผ่าน')
      return
    }

    const effectiveRegistered = copyAddressIfSame(currentAddress, registeredAddress, sameAsCurrentAddress)
    const payload = {
      name: `${form.prefix}${form.firstName.trim()} ${form.lastName.trim()}`.replace(/\s+/g, ' ').trim(),
      prefix: form.prefix,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      nickname: form.nickname.trim() || undefined,
      email: form.email.trim().toLowerCase(),
      phone: form.phone,
      lineId: form.lineId.trim(),
      birthDate: form.birthDate || undefined,
      nationalId: form.nationalId,
      nationality: form.nationality.trim() || undefined,
      maritalStatus: form.maritalStatus || undefined,
      role: form.role as 'EMPLOYEE' | 'LAWYER',
      branchId: form.branchId,
      socialSecurity: form.socialSecurity,
      password: form.password,
      currentAddress,
      registeredAddress: effectiveRegistered,
      sameAsCurrentAddress,
      emergencyContacts,
      dependents,
      bankAccounts,
    }

    setLoading(true)
    try {
      const { ok, data, status } = await apiJson<{ success?: boolean; message?: string }>(
        '/api/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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

      clearRegisterDraft(window.localStorage)
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

  const addressInputClass = (err?: string) =>
    `w-full rounded-xl border bg-slate-900/95 px-4 py-3 text-sm text-white placeholder-slate-400 outline-none transition-all focus:ring-2 focus:ring-green-500/50 ${err ? 'border-red-500/50' : 'border-white/10 focus:border-green-500/50'}`

  const renderAddressFields = (
    address: RegisterAddress,
    setField: (key: keyof RegisterAddress, val: string) => void,
    fieldErrors: Partial<Record<keyof RegisterAddress, string>>,
    idPrefix: string,
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {ADDRESS_FIELD_LABELS.map(({ key, label, required }) => (
        <div key={key} className="space-y-1.5 min-w-0">
          <label htmlFor={`${idPrefix}-${key}`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">{label}{required ? ' *' : ''}</label>
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

      {/* STEP 3: Dependents (optional) */}
      {step === 3 && (
        <div className="space-y-4 animate-fade-in">
          <p className="text-xs text-slate-400 light:text-slate-600">ไม่บังคับ — ข้ามได้ถ้าไม่มีผู้อยู่ในอุปการะ (เพิ่มได้สูงสุด {MAX_REGISTER_DEPENDENTS} คน)</p>
          {dependents.map((dep, i) => {
            const err = dependentErrors[i] ?? {}
            return (
              <div key={i} className="space-y-3 rounded-xl border border-white/10 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ผู้อยู่ในอุปการะ #{i + 1}</span>
                  <button type="button" onClick={() => removeDependent(i)} className="text-red-400 hover:text-red-300 p-1" aria-label="ลบผู้อยู่ในอุปการะคนนี้">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor={`dep-${i}-name`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ชื่อ-นามสกุล *</label>
                    <input id={`dep-${i}-name`} type="text" className={addressInputClass(err.name)} value={dep.name} onChange={(e) => setDependentField(i, 'name', e.target.value)} />
                    {err.name && <p className="text-xs text-red-400">{err.name}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`dep-${i}-rel`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ความสัมพันธ์ *</label>
                    <select id={`dep-${i}-rel`} className={addressInputClass(err.relationType)} value={dep.relationType} onChange={(e) => setDependentField(i, 'relationType', e.target.value)}>
                      <option value="">เลือกความสัมพันธ์</option>
                      {DEPENDENT_RELATION_TYPES.map((r) => <option key={r} value={r}>{DEPENDENT_RELATION_LABELS[r]}</option>)}
                    </select>
                    {err.relationType && <p className="text-xs text-red-400">{err.relationType}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`dep-${i}-birth`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">วันเกิด</label>
                    <input id={`dep-${i}-birth`} type="date" className={addressInputClass()} value={dep.birthDate} onChange={(e) => setDependentField(i, 'birthDate', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`dep-${i}-nid`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">เลขบัตรประชาชน</label>
                    <input id={`dep-${i}-nid`} type="text" placeholder="ไม่บังคับ" className={addressInputClass()} value={dep.nationalId} onChange={(e) => setDependentField(i, 'nationalId', e.target.value)} />
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={dep.isTaxAllowance} onChange={(e) => setDependentField(i, 'isTaxAllowance', e.target.checked)} className="accent-green-500 h-4 w-4" />
                  ใช้สิทธิลดหย่อนภาษี
                </label>
              </div>
            )
          })}
          {dependents.length < MAX_REGISTER_DEPENDENTS && (
            <button type="button" onClick={addDependent} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 py-2.5 text-sm text-slate-300 hover:border-white/40 hover:text-white transition-all">
              <Plus size={15} /> เพิ่มผู้อยู่ในอุปการะ
            </button>
          )}
        </div>
      )}

      {/* STEP 4: Bank Accounts (optional) */}
      {step === 4 && (
        <div className="space-y-4 animate-fade-in">
          <p className="text-xs text-slate-400 light:text-slate-600">ไม่บังคับ — ข้ามได้ถ้ายังไม่มีบัญชีธนาคาร (เพิ่มได้สูงสุด {MAX_REGISTER_BANK_ACCOUNTS} บัญชี)</p>
          {bankAccounts.map((acc, i) => {
            const err = bankAccountErrors[i] ?? {}
            return (
              <div key={i} className="space-y-3 rounded-xl border border-white/10 p-4">
                <div className="flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">
                    <input type="radio" name="primary-bank" checked={acc.isPrimary} onChange={() => setPrimaryBankAccount(i)} className="accent-green-500" />
                    บัญชีหลัก
                  </label>
                  <button type="button" onClick={() => removeBankAccount(i)} className="text-red-400 hover:text-red-300 p-1" aria-label="ลบบัญชีนี้">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor={`bank-${i}-code`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ธนาคาร *</label>
                    <select id={`bank-${i}-code`} className={addressInputClass(err.bankCode)} value={acc.bankCode} onChange={(e) => setBankAccountField(i, 'bankCode', e.target.value)}>
                      <option value="">เลือกธนาคาร</option>
                      {THAI_BANKS.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
                    </select>
                    {err.bankCode && <p className="text-xs text-red-400">{err.bankCode}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`bank-${i}-type`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ประเภทบัญชี</label>
                    <select id={`bank-${i}-type`} className={addressInputClass()} value={acc.accountType} onChange={(e) => setBankAccountField(i, 'accountType', e.target.value)}>
                      <option value="">ไม่ระบุ</option>
                      <option value="ออมทรัพย์">ออมทรัพย์</option>
                      <option value="กระแสรายวัน">กระแสรายวัน</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`bank-${i}-number`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">เลขบัญชี *</label>
                    <input id={`bank-${i}-number`} type="text" inputMode="numeric" placeholder="1234567890" className={addressInputClass(err.accountNumber)} value={acc.accountNumber} onChange={(e) => setBankAccountField(i, 'accountNumber', e.target.value.replace(/\D/g, '').slice(0, 15))} />
                    {err.accountNumber && <p className="text-xs text-red-400">{err.accountNumber}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`bank-${i}-name`} className="text-xs font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">ชื่อบัญชี *</label>
                    <input id={`bank-${i}-name`} type="text" placeholder="ชื่ออาจไม่ตรงกับชื่อพนักงาน เช่น บัญชีร่วม" className={addressInputClass(err.accountName)} value={acc.accountName} onChange={(e) => setBankAccountField(i, 'accountName', e.target.value)} />
                    {err.accountName && <p className="text-xs text-red-400">{err.accountName}</p>}
                  </div>
                </div>
              </div>
            )
          })}
          {bankAccounts.length < MAX_REGISTER_BANK_ACCOUNTS && (
            <button type="button" onClick={addBankAccount} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 py-2.5 text-sm text-slate-300 hover:border-white/40 hover:text-white transition-all">
              <Plus size={15} /> เพิ่มบัญชีธนาคาร
            </button>
          )}
        </div>
      )}

      {/* STEP 5: Employee Info */}
      {step === 5 && (
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

      {/* STEP 6: Password */}
      {step === 6 && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-sm text-slate-300">
            <p className="font-semibold text-white mb-1">สรุปข้อมูล</p>
            <p>ชื่อ: {form.prefix}{form.firstName} {form.lastName} ({form.nickname || '-'})</p>
            <p>อีเมล: {form.email}</p>
            <p>สาขา: {branches.find((b) => b.id === form.branchId)?.label ?? '—'}</p>
            <p>ตำแหน่ง/Role: {ROLES.find(r => r.value === form.role)?.label ?? '-'}</p>
            <p>ผู้ติดต่อฉุกเฉิน: {emergencyContacts.length} คน</p>
            <p>ผู้อยู่ในอุปการะ: {dependents.length} คน</p>
            <p>บัญชีธนาคาร: {bankAccounts.length} บัญชี</p>
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
