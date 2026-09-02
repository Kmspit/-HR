'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Loader2, MapPin, AlertTriangle, RotateCcw, Save, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import FormField from '@/components/profile/FormField'
import { profileInputClass, profileInputErrorClass } from '@/lib/profile-validators-client'
import { MARITAL_STATUS_OPTIONS } from '@/lib/marital-status'
import { ADDRESS_FIELD_LABELS } from '@/lib/address-field-labels'
import type { RegisterAddress } from '@/lib/register-form-validation'
import {
  employeeProfileLoadReducer,
  initialEmployeeProfileLoadState,
  shouldStartEmployeeProfileLoad,
  type EmployeeProfileLoadData,
} from '@/lib/employee-profile-load'
import {
  validateEmployeeProfile,
  employeeProfileHasErrors,
  type EmployeeProfileForm,
  type EmployeeProfileErrors,
} from '@/lib/employee-profile-validation'

const EMPTY_ERRORS: EmployeeProfileErrors = { currentAddress: {}, registeredAddress: {} }

/** Lazy-loaded — same reasoning as EmployeeEditHistoryTab: data only fetches
 *  once this tab is actually opened, and stays mounted across tab switches
 *  (parent renders it unconditionally) so switching away and back never
 *  refetches or loses an in-progress edit. */
export default function EmployeeProfileTab({ employeeId, active }: { employeeId: string; active: boolean }) {
  const [loadState, dispatchLoad] = useReducer(employeeProfileLoadReducer, initialEmployeeProfileLoadState)
  const startedRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const [form, setForm] = useState<EmployeeProfileForm | null>(null)
  const [errors, setErrors] = useState<EmployeeProfileErrors>(EMPTY_ERRORS)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    dispatchLoad({ type: 'START' })
    let ok = false
    let status = 0
    let data: { profile?: EmployeeProfileLoadData } = {}
    try {
      const res = await apiJson<{ profile: EmployeeProfileLoadData }>(`/api/users/${employeeId}/profile`)
      ok = res.ok
      status = res.status
      data = res.data
    } catch {
      ok = false
      status = 0
    } finally {
      if (mountedRef.current) {
        if (ok && data.profile) {
          dispatchLoad({ type: 'SUCCESS', data: data.profile })
          setForm(data.profile)
        } else {
          dispatchLoad({ type: 'FAILURE', status })
        }
      }
    }
  }, [employeeId])

  useEffect(() => {
    if (!shouldStartEmployeeProfileLoad(active, startedRef.current)) return
    startedRef.current = true
    void load()
  }, [active, employeeId, load])

  const setField = (key: keyof EmployeeProfileForm, value: string | boolean) => {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }
  const setCurrentAddressField = (key: keyof RegisterAddress, value: string) => {
    setForm((f) => (f ? { ...f, currentAddress: { ...f.currentAddress, [key]: value } } : f))
    setErrors((e) => ({ ...e, currentAddress: { ...e.currentAddress, [key]: undefined } }))
  }
  const setRegisteredAddressField = (key: keyof RegisterAddress, value: string) => {
    setForm((f) => (f ? { ...f, registeredAddress: { ...f.registeredAddress, [key]: value } } : f))
    setErrors((e) => ({ ...e, registeredAddress: { ...e.registeredAddress, [key]: undefined } }))
  }

  const save = async () => {
    if (!form) return
    const v = validateEmployeeProfile(form)
    setErrors(v)
    if (employeeProfileHasErrors(v)) {
      toast.error('กรุณาตรวจสอบข้อมูลที่กรอก')
      return
    }
    setSaving(true)
    try {
      const { ok, data, status } = await apiJson(`/api/users/${employeeId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (ok) {
        toast.success('บันทึกข้อมูลส่วนตัวแล้ว')
      } else {
        toast.error(apiErrorMessage(data, 'บันทึกไม่สำเร็จ', status))
      }
    } catch (err) {
      console.error('[employee-profile-tab]', err)
      toast.error('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  if (!active) return null

  if (loadState.phase === 'idle' || loadState.phase === 'loading') {
    return (
      <div className="glass-card rounded-2xl p-8 flex items-center justify-center gap-2 text-white/40 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดข้อมูล...
      </div>
    )
  }

  if (loadState.phase === 'error') {
    return (
      <div className="glass-card rounded-2xl p-8 text-center space-y-3">
        <AlertTriangle className="w-5 h-5 text-red-400 mx-auto" />
        <p className="text-sm text-white/60">{loadState.message}</p>
        {loadState.canRetry && (
          <button
            type="button"
            onClick={() => { void load() }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 text-xs font-semibold transition"
          >
            <RotateCcw className="w-3.5 h-3.5" /> ลองใหม่
          </button>
        )}
      </div>
    )
  }

  if (!form) return null

  const addrClass = (err?: string) => (err ? profileInputErrorClass : profileInputClass)

  const renderAddress = (
    address: RegisterAddress,
    setter: (key: keyof RegisterAddress, value: string) => void,
    fieldErrors: Partial<Record<keyof RegisterAddress, string>>,
    idPrefix: string,
    disabled = false,
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {ADDRESS_FIELD_LABELS.map(({ key, label, required }) => (
        <FormField key={key} label={label} required={required} error={fieldErrors[key]}>
          <input
            id={`${idPrefix}-${key}`}
            value={address[key]}
            disabled={disabled}
            onChange={(e) => setter(key, e.target.value)}
            className={`${addrClass(fieldErrors[key])} disabled:opacity-50`}
          />
        </FormField>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <section className="glass-card rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
          <MapPin className="w-4 h-4 text-cyan-400" /> ข้อมูลส่วนตัวเพิ่มเติม
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField label="สัญชาติ">
            <input value={form.nationality} onChange={(e) => setField('nationality', e.target.value)} className={profileInputClass} />
          </FormField>
          <FormField label="สถานภาพสมรส">
            <select value={form.maritalStatus} onChange={(e) => setField('maritalStatus', e.target.value)} className={profileInputClass}>
              <option value="" className="bg-slate-900">— ไม่ระบุ —</option>
              {MARITAL_STATUS_OPTIONS.map((m) => (
                <option key={m} value={m} className="bg-slate-900">{m}</option>
              ))}
            </select>
          </FormField>
          <FormField label="อีเมลส่วนตัว" error={errors.personalEmail}>
            <input
              type="email"
              value={form.personalEmail}
              onChange={(e) => setField('personalEmail', e.target.value)}
              className={errors.personalEmail ? profileInputErrorClass : profileInputClass}
            />
          </FormField>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
          <MapPin className="w-4 h-4 text-green-400" /> ที่อยู่ปัจจุบัน
        </h2>
        {renderAddress(form.currentAddress, setCurrentAddressField, errors.currentAddress, 'cur')}
      </section>

      <section className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-amber-400" /> ที่อยู่ตามทะเบียนบ้าน
          </h2>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-white/60">
            <input
              type="checkbox"
              checked={form.sameAsCurrentAddress}
              onChange={(e) => setField('sameAsCurrentAddress', e.target.checked)}
              className="w-4 h-4 accent-green-500"
            />
            <Copy className="w-3.5 h-3.5" /> เหมือนที่อยู่ปัจจุบัน
          </label>
        </div>
        {!form.sameAsCurrentAddress &&
          renderAddress(form.registeredAddress, setRegisteredAddressField, errors.registeredAddress, 'reg')}
      </section>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        บันทึกข้อมูลส่วนตัวเพิ่มเติม
      </button>
    </div>
  )
}
