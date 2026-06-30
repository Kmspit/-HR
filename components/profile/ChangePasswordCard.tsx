'use client'

import { useState } from 'react'
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { englishOnlyFieldError, ENGLISH_ONLY_ERROR } from '@/lib/english-input'
import { validateChangePasswordStrength } from '@/lib/change-password'
import FormField from '@/components/profile/FormField'
import { profileInputClass, profileInputErrorClass } from '@/lib/profile-validators-client'

type FieldKey = 'currentPassword' | 'newPassword' | 'confirmPassword'

type FormState = Record<FieldKey, string>

const EMPTY: FormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

function fieldClass(err?: string) {
  return err ? profileInputErrorClass : profileInputClass
}

export default function ChangePasswordCard() {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [show, setShow] = useState<Record<FieldKey, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  })
  const [saving, setSaving] = useState(false)

  const setEnglishField = (key: FieldKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    const msg = englishOnlyFieldError(value)
    setErrors((prev) => {
      const next = { ...prev }
      if (msg) next[key] = msg
      else if (next[key] === ENGLISH_ONLY_ERROR) delete next[key]
      return next
    })
  }

  const validateClient = (): Partial<Record<FieldKey, string>> => {
    const e: Partial<Record<FieldKey, string>> = {}
    if (!form.currentPassword) e.currentPassword = 'กรุณากรอกรหัสผ่านปัจจุบัน'
    else if (englishOnlyFieldError(form.currentPassword)) e.currentPassword = ENGLISH_ONLY_ERROR

    if (!form.newPassword) e.newPassword = 'กรุณากรอกรหัสผ่านใหม่'
    else if (englishOnlyFieldError(form.newPassword)) e.newPassword = ENGLISH_ONLY_ERROR
    else {
      const strength = validateChangePasswordStrength(form.newPassword)
      if (strength) e.newPassword = strength
    }

    if (!form.confirmPassword) e.confirmPassword = 'กรุณายืนยันรหัสผ่านใหม่'
    else if (englishOnlyFieldError(form.confirmPassword)) e.confirmPassword = ENGLISH_ONLY_ERROR
    else if (form.newPassword !== form.confirmPassword) e.confirmPassword = 'รหัสผ่านใหม่ไม่ตรงกัน'

    return e
  }

  const submit = async () => {
    const v = validateClient()
    if (Object.keys(v).length) {
      setErrors(v)
      toast.error('กรุณาตรวจสอบข้อมูลรหัสผ่าน')
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const { ok, data, status } = await apiJson<{ ok?: boolean; message?: string; field?: string; error?: string }>(
        '/api/profile/change-password',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      )

      if (!ok) {
        const msg = apiErrorMessage(data as Record<string, unknown>, 'เปลี่ยนรหัสผ่านไม่สำเร็จ', status)
        toast.error(msg)
        if (data.field && typeof data.field === 'string') {
          setErrors({ [data.field as FieldKey]: msg })
        }
        return
      }

      toast.success(data.message ?? 'เปลี่ยนรหัสผ่านสำเร็จ')
      setForm(EMPTY)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  const englishBlocked =
    !!englishOnlyFieldError(form.currentPassword) ||
    !!englishOnlyFieldError(form.newPassword) ||
    !!englishOnlyFieldError(form.confirmPassword)

  const renderPasswordField = (
    key: FieldKey,
    label: string,
    placeholder: string,
    autoComplete: string,
  ) => (
    <FormField label={label} error={errors[key]}>
      <div className="relative">
        <input
          type={show[key] ? 'text' : 'password'}
          value={form[key]}
          onChange={(e) => setEnglishField(key, e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`${fieldClass(errors[key])} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          aria-label={show[key] ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        >
          {show[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </FormField>
  )

  return (
    <section className="glass-card rounded-2xl p-5 md:p-6 space-y-4 border border-amber-500/15">
      <h3 className="text-sm font-semibold dark:text-white light:text-slate-900 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-amber-400" />
        เปลี่ยนรหัสผ่าน
      </h3>
      <p className="text-xs dark:text-slate-500 light:text-slate-500">
        ใช้ตัวอักษรภาษาอังกฤษ ตัวเลข และสัญลักษณ์ที่จำเป็นเท่านั้น — อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข
      </p>
      <div className="grid grid-cols-1 gap-3 md:gap-4 max-w-xl">
        {renderPasswordField('currentPassword', 'รหัสผ่านปัจจุบัน', '••••••••', 'current-password')}
        {renderPasswordField('newPassword', 'รหัสผ่านใหม่', 'อย่างน้อย 8 ตัว', 'new-password')}
        {renderPasswordField('confirmPassword', 'ยืนยันรหัสผ่านใหม่', '••••••••', 'new-password')}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={saving || englishBlocked}
        className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold disabled:opacity-50 transition"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        {saving ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
      </button>
    </section>
  )
}
