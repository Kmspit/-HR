'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { englishOnlyFieldError, ENGLISH_ONLY_ERROR, isEnglishOnly } from '@/lib/english-input'

const ERROR_MESSAGES: Record<string, string> = {
  MISSING_FIELDS: 'กรุณากรอกอีเมลและรหัสผ่าน',
  INVALID_CREDENTIALS: 'อีเมล/รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง',
  ACCOUNT_LOCKED: 'บัญชีถูกล็อคชั่วคราว กรุณาลองใหม่ใน 15 นาที',
  PENDING_APPROVAL: 'บัญชีของคุณรอการอนุมัติจาก HR — รหัสผ่านถูกต้องแล้ว',
  ACCOUNT_DISABLED: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อ HR',
  ACCOUNT_REJECTED: 'คำขอสมัครถูกปฏิเสธ กรุณาติดต่อ HR',
  CredentialsSignin: 'อีเมล/รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง',
  SessionRequired: 'กรุณาเข้าสู่ระบบอีกครั้ง',
  SERVER_ERROR: 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง',
  AUTH_SECRET_MISSING: 'ระบบยังไม่พร้อม กรุณาติดต่อผู้ดูแล',
}

type Step = 'credentials' | '2fa'

export default function LoginForm({ initialError }: { initialError?: string | null }) {
  const [loading, setLoading]     = useState(false)
  const [showPw, setShowPw]       = useState(false)
  const [form, setForm]           = useState({ email: '', password: '' })
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const [step, setStep]           = useState<Step>('credentials')
  const [challenge, setChallenge] = useState('')
  const [pendingToken, setPendingToken] = useState('')
  const [otpCode, setOtpCode]     = useState('')

  useEffect(() => {
    if (initialError && ERROR_MESSAGES[initialError]) {
      toast.error(ERROR_MESSAGES[initialError])
    }
  }, [initialError])

  const validate = () => {
    const e: Record<string, string> = {}
    const id = form.email.trim()
    if (!id) e.email = 'กรุณากรอกอีเมลหรือรหัสพนักงาน'
    else if (!isEnglishOnly(id)) e.email = ENGLISH_ONLY_ERROR
    else if (id.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) {
      e.email = 'รูปแบบอีเมลไม่ถูกต้อง'
    }
    if (!form.password) e.password = 'กรุณากรอกรหัสผ่าน'
    else if (!isEnglishOnly(form.password)) e.password = ENGLISH_ONLY_ERROR
    return e
  }

  const setEmail = (value: string) => {
    setForm((f) => ({ ...f, email: value }))
    setErrors((prev) => ({ ...prev, email: englishOnlyFieldError(value) ?? '' }))
  }

  const setPassword = (value: string) => {
    setForm((f) => ({ ...f, password: value }))
    setErrors((prev) => ({ ...prev, password: englishOnlyFieldError(value) ?? '' }))
  }

  const englishBlocked =
    !!englishOnlyFieldError(form.email) || !!englishOnlyFieldError(form.password)

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
        body: JSON.stringify({ email: form.email.trim(), password: form.password }),
      })

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        message?: string | null
        url?: string
        requires2FA?: boolean
        pendingToken?: string
      }

      if (data.requires2FA) {
        if (!data.pendingToken) {
          toast.error('ระบบขัดข้อง กรุณาลองใหม่')
          setLoading(false)
          return
        }
        setPendingToken(data.pendingToken)
        const otpRes = await fetch('/api/security/2fa/request-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pendingToken: data.pendingToken }),
        })
        const otpData = await otpRes.json() as { challenge?: string }
        setChallenge(otpData.challenge ?? '')
        setStep('2fa')
        toast.info('ส่งรหัส OTP ไปยัง LINE แล้ว กรุณาตรวจสอบ')
        setLoading(false)
        return
      }

      if (!res.ok || !data.ok) {
        const code = data.error ?? ''
        toast.error(ERROR_MESSAGES[code] ?? data.message ?? 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่')
        setLoading(false)
        return
      }

      if (data.message) toast.success(data.message)
      else toast.success('เข้าสู่ระบบสำเร็จ')

      const dest = data.url && data.url.startsWith('/') ? data.url : '/dashboard'
      window.location.href = dest
    } catch {
      toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otpCode.trim()) { toast.error('กรุณากรอกรหัส OTP'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/security/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ challenge, code: otpCode.trim(), pendingToken }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; url?: string; message?: string | null }

      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'รหัส OTP ไม่ถูกต้อง')
        setLoading(false)
        return
      }

      if (data.message) toast.success(data.message)
      else toast.success('เข้าสู่ระบบสำเร็จ')

      const dest = data.url && data.url.startsWith('/') ? data.url : '/dashboard'
      window.location.href = dest
    } catch {
      toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const inputBase =
    'w-full rounded-xl border px-4 py-3.5 text-[15px] outline-none transition-all bg-white/[0.06] text-white placeholder:text-slate-500 border-white/10 focus:border-green-500/60 focus:ring-2 focus:ring-green-500/10'
  const inputError = `${inputBase} border-red-500/50`

  if (step === '2fa') {
    return (
      <form onSubmit={handleVerifyOtp} className="space-y-4">
        <div className="flex flex-col items-center gap-2 pb-2">
          <ShieldCheck size={40} className="text-green-400" />
          <p className="text-sm text-slate-300 text-center">
            กรุณากรอกรหัส OTP 6 หลักที่ส่งไปยัง LINE ของคุณ
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
            รหัส OTP
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            placeholder="123456"
            className={inputBase}
            value={otpCode}
            onChange={(ev) => setOtpCode(ev.target.value.replace(/\D/g, ''))}
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold text-white disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg,#22c55e,#6366f1)' }}
        >
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> กำลังยืนยัน...</>
            : 'ยืนยันรหัส OTP'}
        </button>

        <button
          type="button"
          onClick={() => { setStep('credentials'); setOtpCode(''); setPendingToken('') }}
          className="w-full text-xs text-slate-500 hover:text-slate-300 text-center"
        >
          ย้อนกลับ
        </button>
      </form>
    )
  }

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
          className={errors.email ? inputError : inputBase}
          value={form.email}
          onChange={(ev) => setEmail(ev.target.value)}
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
            className={`${errors.password ? inputError : inputBase} pr-12`}
            value={form.password}
            onChange={(ev) => setPassword(ev.target.value)}
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
        disabled={loading || englishBlocked}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold text-white disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg,#22c55e,#6366f1)' }}
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> กำลังเข้าสู่ระบบ...</>
          : 'เข้าสู่ระบบ'}
      </button>
    </form>
  )
}
