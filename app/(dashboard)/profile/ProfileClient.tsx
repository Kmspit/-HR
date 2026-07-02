'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Camera,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Save,
  User,
  MapPin,
} from 'lucide-react'
import { lineIdHint } from '@/lib/line-id-client'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { getInitials } from '@/lib/utils'
import { resolveProfileImageUrl } from '@/lib/profile-avatar-url'
import FormField from '@/components/profile/FormField'
import {
  profileInputClass,
  profileInputErrorClass,
  validateSelfProfileForm,
  type ProfileFormErrors,
} from '@/lib/profile-validators-client'
import ProfileDataHistory, { type ProfileRecordInfo } from '@/components/profile/ProfileDataHistory'
import LineLinkCard from '@/components/profile/LineLinkCard'
import ChangePasswordCard from '@/components/profile/ChangePasswordCard'
import type { ProfileHistoryItem } from '@/lib/profile-history'
import { USER_STATUS_LABEL as STATUS_LABELS } from '@/lib/status-labels'

const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'ดร.']

type ProfileData = {
  prefix: string
  firstName: string
  lastName: string
  nickname: string
  phone: string
  email: string
  address: string
  addressIdCard: string
  birthDate: string
  nationalId: string
  profileImage: string | null
  employeeId: string
  roleLabel: string
  branchName: string
  status: string
  department: string
  position: string
  baseSalary: number | null
  startDate: string
  socialSecurity: boolean
  lineId: string
  lineUserId: string
  lineDisplayName: string
  createdAt: string
}

type Props = {
  initial: ProfileData
  recordInfo: ProfileRecordInfo
  editHistory: ProfileHistoryItem[]
}

function fieldClass(err?: string) {
  return err ? profileInputErrorClass : profileInputClass
}

export default function ProfileClient({ initial, recordInfo, editHistory }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    prefix: initial.prefix,
    firstName: initial.firstName,
    lastName: initial.lastName,
    nickname: initial.nickname,
    email: initial.email,
    phone: initial.phone,
    address: initial.address,
    addressIdCard: initial.addressIdCard,
    birthDate: initial.birthDate,
    nationalId: initial.nationalId,
    lineId: initial.lineId,
  })
  const [errors, setErrors] = useState<ProfileFormErrors>({})
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    resolveProfileImageUrl(initial.profileImage) ??
      (initial.profileImage?.startsWith('/uploads') ? initial.profileImage : null),
  )
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: val }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const onAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพ')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('รูปต้องไม่เกิน 2 MB')
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const save = async () => {
    const v = validateSelfProfileForm(form)
    if (Object.keys(v).length) {
      setErrors(v)
      toast.error('กรุณาตรวจสอบข้อมูลที่กรอก')
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const payload = {
        prefix: form.prefix,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        nickname: form.nickname.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone,
        address: form.address.trim(),
        addressIdCard: form.addressIdCard.trim(),
        birthDate: form.birthDate || '',
        nationalId: form.nationalId.replace(/\D/g, ''),
        lineId: form.lineId.trim(),
      }

      let init: RequestInit
      if (avatarFile) {
        const fd = new FormData()
        Object.entries(payload).forEach(([k, val]) => fd.append(k, val))
        fd.append('avatar', avatarFile, avatarFile.name)
        init = { method: 'PATCH', body: fd }
      } else {
        init = {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      }

      const { ok, data, status } = await apiJson<{
        message?: string
        profile?: { profileImage?: string | null; email?: string }
      }>('/api/profile', init)

      if (!ok) {
        toast.error(apiErrorMessage(data as Record<string, unknown>, 'บันทึกไม่สำเร็จ', status))
        return
      }
      toast.success(data.message ?? 'บันทึกโปรไฟล์แล้ว')
      if (data.profile?.profileImage) {
        const url = resolveProfileImageUrl(data.profile.profileImage)
        if (url) setAvatarPreview(`${url}?t=${Date.now()}`)
      }
      setAvatarFile(null)
      if (data.profile?.email && data.profile.email !== form.email) {
        toast.message('อีเมลเปลี่ยนแล้ว — ครั้งถัดไปให้เข้าสู่ระบบด้วยอีเมลใหม่')
      }
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  const displayName = `${form.prefix}${form.firstName} ${form.lastName}`.trim()

  return (
    <div className="w-full p-4 md:p-6 lg:px-8 pb-28 md:pb-8 space-y-5 md:space-y-6">
      {/* Hero + avatar */}
      <div className="glass-card rounded-2xl p-5 md:p-8">
        <div className="flex flex-col sm:flex-row gap-6 sm:items-center">
          <div className="relative mx-auto sm:mx-0 flex-shrink-0">
            <div
              className="w-28 h-28 rounded-2xl overflow-hidden flex items-center justify-center text-2xl font-bold text-white border border-white/10"
              style={{
                background: avatarPreview
                  ? undefined
                  : 'linear-gradient(135deg, #22c55e 0%, #8b5cf6 100%)',
              }}
            >
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                getInitials(displayName || initial.email)
              )}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 p-2.5 rounded-xl bg-green-600 text-white shadow-lg hover:bg-green-500 transition touch-manipulation"
              aria-label="เปลี่ยนรูปโปรไฟล์"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onAvatarChange}
            />
          </div>
          <div className="text-center sm:text-left min-w-0 flex-1">
            <h2 className="text-lg md:text-xl font-bold dark:text-white light:text-slate-900 truncate">{displayName || '—'}</h2>
            <p className="text-sm dark:text-slate-400 light:text-slate-600 mt-1 truncate">{form.email}</p>
            <p className="text-xs dark:text-slate-500 light:text-slate-500 mt-2">
              {initial.roleLabel} · {STATUS_LABELS[initial.status] ?? initial.status}
            </p>
            <p className="text-[11px] dark:text-slate-600 light:text-slate-500 mt-2">
              รูป JPG/PNG/WEBP สูงสุด 2 MB — Role/สิทธิ์แก้ได้เฉพาะ HR
            </p>
          </div>
        </div>
      </div>

      {/* Personal */}
      <section className="glass-card rounded-2xl p-5 md:p-6 space-y-4">
        <h3 className="text-sm font-semibold dark:text-white light:text-slate-900 flex items-center gap-2">
          <User className="w-4 h-4 text-green-400" />
          ข้อมูลส่วนตัว
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <FormField label="คำนำหน้า">
            <select
              value={form.prefix}
              onChange={(e) => set('prefix', e.target.value)}
              className={profileInputClass}
            >
              {PREFIXES.map((p) => (
                <option key={p} value={p} className="bg-slate-900">
                  {p}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="ชื่อ" required error={errors.firstName}>
            <input
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              className={fieldClass(errors.firstName)}
            />
          </FormField>
          <FormField label="นามสกุล">
            <input
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              className={profileInputClass}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          <FormField label="ชื่อเล่น">
            <input
              value={form.nickname}
              onChange={(e) => set('nickname', e.target.value)}
              className={profileInputClass}
            />
          </FormField>
          <FormField label="วันเกิด" error={errors.birthDate}>
            <input
              type="date"
              value={form.birthDate}
              onChange={(e) => set('birthDate', e.target.value)}
              className={fieldClass(errors.birthDate)}
            />
          </FormField>
        </div>
        <FormField label="เลขบัตรประชาชน" error={errors.nationalId} hint="13 หลัก (ไม่บังคับ)">
          <input
            value={form.nationalId}
            onChange={(e) => set('nationalId', e.target.value.replace(/\D/g, '').slice(0, 13))}
            placeholder="1234567890123"
            className={fieldClass(errors.nationalId)}
            inputMode="numeric"
          />
        </FormField>
      </section>

      {/* Contact */}
      <section className="glass-card rounded-2xl p-5 md:p-6 space-y-4">
        <h3 className="text-sm font-semibold dark:text-white light:text-slate-900 flex items-center gap-2">
          <Mail className="w-4 h-4 text-cyan-400" />
          ข้อมูลติดต่อ
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          <FormField label="อีเมล" required error={errors.email} hint="ใช้เข้าสู่ระบบ">
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className={fieldClass(errors.email)}
              autoComplete="email"
            />
          </FormField>
          <FormField label="เบอร์โทร" required error={errors.phone}>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="0812345678"
                className={`${fieldClass(errors.phone)} pl-10`}
                inputMode="tel"
              />
            </div>
          </FormField>
        </div>
        <FormField label="ที่อยู่ปัจจุบัน">
          <div className="relative">
            <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-500 pointer-events-none" />
            <textarea
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              rows={2}
              placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
              className={`${profileInputClass} pl-10 resize-none`}
            />
          </div>
        </FormField>
        <FormField label="ที่อยู่ตามบัตรประชาชน">
          <div className="relative">
            <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
            <textarea
              value={form.addressIdCard}
              onChange={(e) => set('addressIdCard', e.target.value)}
              rows={2}
              placeholder="ที่อยู่ตามบัตรประชาชน (ถ้าต่างจากที่อยู่ปัจจุบัน)"
              className={`${profileInputClass} pl-10 resize-none`}
            />
          </div>
        </FormField>
      </section>

      {/* LINE */}
      <section className="glass-card rounded-2xl p-5 md:p-6 space-y-4 border border-green-500/15">
        <h3 className="text-sm font-semibold dark:text-white light:text-slate-900 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-green-400" />
          LINE Integration
        </h3>
        <FormField label="LINE ID" required error={errors.lineId} hint={lineIdHint()}>
          <input
            value={form.lineId}
            onChange={(e) => set('lineId', e.target.value)}
            placeholder="@username"
            className={fieldClass(errors.lineId)}
          />
        </FormField>
        <LineLinkCard onLinked={() => router.refresh()} />
      </section>

      <ChangePasswordCard />

      <ProfileDataHistory record={recordInfo} history={editHistory} />

      {/* Desktop save */}
      <div className="hidden md:flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-8 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-50 transition"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์'}
        </button>
      </div>

      {/* Mobile sticky save */}
      <div
        className="md:hidden fixed left-0 right-0 z-[45] p-4 pt-3 border-t dark:border-white/10 light:border-slate-200 dark:bg-slate-950/95 light:bg-white/95 backdrop-blur-md"
        style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold text-sm disabled:opacity-50 transition touch-manipulation"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {saving ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์'}
        </button>
      </div>
    </div>
  )
}
