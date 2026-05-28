'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  MISSING_FIELDS: 'กรุณากรอกอีเมลและรหัสผ่าน',
  INVALID_CREDENTIALS: 'อีเมล/รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง',
  PENDING_APPROVAL: 'บัญชีของคุณรอการอนุมัติจาก HR — รหัสผ่านถูกต้องแล้ว',
  ACCOUNT_DISABLED: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อ HR',
  ACCOUNT_REJECTED: 'คำขอสมัครถูกปฏิเสธ กรุณาติดต่อ HR',
  CredentialsSignin: 'อีเมล/รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง',
  SessionRequired: 'กรุณาเข้าสู่ระบบอีกครั้ง',
  SERVER_ERROR: 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง',
  AUTH_SECRET_MISSING: 'ระบบยังไม่พร้อม กรุณาติดต่อผู้ดูแล',
}

export default function LoginForm({ initialError }: { initialError?: string | null }) {
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (initialError && ERROR_MESSAGES[initialError]) {
      toast.error(ERROR_MESSAGES[initialError])
    }
  }, [initialError])

  const validate = () => {
    const e: Record<string, string> = {}
    const id = form.email.trim()
    if (!id) e.email = 'กรุณากรอกอีเมลหรือรหัสพนักงาน'
    else if (id.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) {
      e.email = 'รูปแบบอีเมลไม่ถูกต้อง'
    }
    if (!form.password) e.password = 'กรุณากรอกรหัสผ่าน'
    return e
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    setErrors({})

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
        }),
      })

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        message?: string | null
        url?: string
      }

      if (!res.ok || !data.ok) {
        const code = data.error ?? ''
        toast.error(
          ERROR_MESSAGES[code] ?? data.message ?? 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่',
        )
        setLoading(false)
        return
      }

      if (data.message) toast.success(data.message)
      else toast.success('เข้าสู่ระบบสำเร็จ')

      const dest = data.url && data.url.startsWith('/') ? data.url : '/dashboard'
      window.location.assign(dest)
    } catch {
      toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่')
      setLoading(false)
    }
  }

  const inputBase =
    'w-full rounded-xl border px-4 py-3.5 text-[15px] outline-none transition-all dark:bg-white/[0.05] dark:text-white dark:placeholder-slate-500'
  const inputNormal = `${inputBase} dark:border-white/10 dark:focus:border-blue-500/60 dark:focus:ring-2 dark:focus:ring-blue-500/10`
  const inputError = `${inputBase} dark:border-red-500/50`

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
          อีเมล / รหัสพนักงาน
        </label>
        <input
          type="text"
          autoComplete="username"
          placeholder="name@company.com หรือรหัสพนักงาน"
          className={errors.email ? inputError : inputNormal}
          value={form.email}
          onChange={(ev) => setForm((f) => ({ ...f, email: ev.target.value }))}
          disabled={loading}
        />
        {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
          รหัสผ่าน
        </label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            className={`${errors.password ? inputError : inputNormal} pr-12`}
            value={form.password}
            onChange={(ev) => setForm((f) => ({ ...f, password: ev.target.value }))}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold text-white disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> กำลังเข้าสู่ระบบ...</>
          : 'เข้าสู่ระบบ'}
      </button>
    </form>
  )
}
