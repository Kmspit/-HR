'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2, Save, User } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { getInitials } from '@/lib/utils'
import { resolveProfileImageUrl } from '@/lib/profile-avatar-url'

const PREFIXES = ['นาย', 'นาง', 'นางสาว']

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'ใช้งานได้',
  PENDING: 'รออนุมัติ',
  DISABLED: 'ปิดการใช้งาน',
  REJECTED: 'ถูกปฏิเสธ',
}

type ProfileData = {
  prefix: string
  firstName: string
  lastName: string
  nickname: string
  phone: string
  address: string
  profileImage: string | null
  email: string
  employeeId: string
  birthDate: string
  nationalId: string
  roleLabel: string
  branchName: string
  status: string
  department: string
  position: string
  baseSalary: number | null
  startDate: string
  socialSecurity: boolean
  lineId: string
  createdAt: string
}

type Props = { initial: ProfileData }

function formatThaiDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function ProfileClient({ initial }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    prefix: initial.prefix,
    firstName: initial.firstName,
    lastName: initial.lastName,
    nickname: initial.nickname,
    phone: initial.phone,
    address: initial.address,
  })
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    resolveProfileImageUrl(initial.profileImage) ??
      (initial.profileImage?.startsWith('/uploads') ? initial.profileImage : null),
  )
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

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
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error('กรุณากรอกชื่อและนามสกุล')
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('prefix', form.prefix)
      fd.append('firstName', form.firstName.trim())
      fd.append('lastName', form.lastName.trim())
      fd.append('nickname', form.nickname.trim())
      fd.append('phone', form.phone)
      fd.append('address', form.address.trim())
      if (avatarFile) fd.append('avatar', avatarFile, avatarFile.name)

      const { ok, data, status } = await apiJson<{ message?: string; profile?: { profileImage?: string | null } }>(
        '/api/profile',
        { method: 'PATCH', body: fd },
      )
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
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  const displayName = `${form.prefix}${form.firstName} ${form.lastName}`.trim()

  const infoRows: { label: string; value: string }[] = [
    { label: 'อีเมล', value: initial.email },
    { label: 'รหัสพนักงาน', value: initial.employeeId || '—' },
    { label: 'ตำแหน่งในระบบ', value: initial.roleLabel },
    { label: 'สาขา', value: initial.branchName },
    { label: 'สถานะบัญชี', value: STATUS_LABELS[initial.status] ?? initial.status },
    { label: 'แผนก', value: initial.department || '—' },
    { label: 'ตำแหน่งงาน', value: initial.position || '—' },
    { label: 'วันเกิด', value: formatThaiDate(initial.birthDate) },
    { label: 'เลขบัตรประชาชน', value: initial.nationalId || '—' },
    { label: 'วันที่เริ่มงาน', value: formatThaiDate(initial.startDate) },
    {
      label: 'ประกันสังคม',
      value: initial.socialSecurity ? 'อยู่ในระบบ' : 'ไม่อยู่ในระบบ',
    },
    { label: 'LINE ID', value: initial.lineId || '—' },
    { label: 'วันที่สมัคร', value: formatThaiDate(initial.createdAt) },
  ]

  return (
    <div className="w-full max-w-3xl md:max-w-none p-4 md:p-8 lg:px-10 space-y-5 md:space-y-6">
      <div className="glass-card rounded-2xl p-5 md:p-8 lg:p-10 space-y-5 md:space-y-8 w-full md:min-h-[calc(100dvh-10rem)]">
        <h2 className="text-sm md:text-base font-semibold text-white flex items-center gap-2">
          <User className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
          แก้ไขข้อมูลของฉัน
        </h2>

        <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-10 md:flex-1">
          <div className="flex flex-col items-center md:items-start gap-3 flex-shrink-0">
            <div className="relative">
              <div
                className="w-24 h-24 md:w-32 md:h-32 rounded-2xl overflow-hidden flex items-center justify-center text-xl md:text-2xl font-bold text-white border border-white/10"
                style={{
                  background: avatarPreview
                    ? undefined
                    : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
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
                className="absolute -bottom-1 -right-1 p-2 rounded-xl bg-blue-600 text-white shadow-lg hover:bg-blue-500 transition touch-manipulation"
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
            <p className="text-xs text-slate-500 text-center md:text-left md:max-w-[10rem]">
              แตะไอคอนกล้องเพื่ออัปโหลดรูป (JPG, PNG, WEBP · สูงสุด 2 MB)
            </p>
          </div>

          <div className="flex-1 min-w-0 space-y-4 md:space-y-5 w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-3 md:gap-4">
          <div>
            <label className="text-xs text-white/50 block mb-1">คำนำหน้า</label>
            <select
              value={form.prefix}
              onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500"
            >
              {PREFIXES.map((p) => (
                <option key={p} value={p} className="bg-slate-900">
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">ชื่อ *</label>
            <input
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">นามสกุล *</label>
            <input
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-3 md:gap-4">
          <div>
            <label className="text-xs text-white/50 block mb-1">ชื่อเล่น</label>
            <input
              value={form.nickname}
              onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">เบอร์โทร *</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500"
              placeholder="0812345678"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-white/50 block mb-1">ที่อยู่</label>
          <textarea
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500 resize-none"
          />
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 transition"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์'}
        </button>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5 md:p-6 max-w-3xl md:max-w-none">
        <h2 className="text-sm font-semibold text-white mb-4">ประวัติข้อมูลตอนสมัครบัญชี</h2>
        <p className="text-xs text-slate-500 mb-4">
          ข้อมูลด้านล่างมาจากตอนลงทะเบียน — แก้ไขได้เฉพาะชื่อ-นามสกุล รูป เบอร์ และที่อยู่ด้านบน
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          {infoRows.map((row) => (
            <div key={row.label} className="border-b border-white/5 pb-2">
              <dt className="text-[11px] text-slate-500">{row.label}</dt>
              <dd className="text-white/90 mt-0.5 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
