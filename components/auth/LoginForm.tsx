'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', remember: false })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.email) e.email = 'กรุณากรอกอีเมล'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'รูปแบบอีเมลไม่ถูกต้อง'
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
      const res = await signIn('credentials', {
        email: form.email.toLowerCase(),
        password: form.password,
        redirect: false,
      })

      if (res?.error) {
        const messages: Record<string, string> = {
          PENDING_APPROVAL: 'บัญชีของคุณรอการอนุมัติจาก HR / Manager',
          ACCOUNT_DISABLED: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อ HR',
          ACCOUNT_REJECTED: 'คำขอสมัครถูกปฏิเสธ กรุณาติดต่อ HR',
          CredentialsSignin: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
        }
        toast.error(messages[res.error] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
        setLoading(false)
        return
      }

      toast.success('เข้าสู่ระบบสำเร็จ')
      router.push('/dashboard')
      router.refresh()
    } catch {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const inputBase = `
    w-full rounded-xl border px-4 py-3.5 text-[15px] outline-none transition-all
    dark:bg-white/[0.05] dark:text-white dark:placeholder-slate-500
    light:bg-white light:text-slate-800 light:placeholder-slate-400
  `
  const inputNormal = `${inputBase}
    dark:border-white/10 dark:focus:border-blue-500/60 dark:focus:bg-white/[0.08] dark:focus:ring-2 dark:focus:ring-blue-500/10
    light:border-slate-200 light:focus:border-blue-400 light:focus:ring-2 light:focus:ring-blue-500/10
  `
  const inputError = `${inputBase}
    dark:border-red-500/50 dark:focus:border-red-500/60
    light:border-red-400 light:focus:border-red-400
  `

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Email */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold uppercase tracking-wider dark:text-slate-400 light:text-slate-500">
          อีเมล / รหัสพนักงาน
        </label>
        <input
          type="text"
          autoComplete="email"
          placeholder="name@company.com"
          className={errors.email ? inputError : inputNormal}
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        {errors.email && (
          <p className="flex items-center gap-1 text-xs text-red-400">
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {errors.email}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold uppercase tracking-wider dark:text-slate-400 light:text-slate-500">
            รหัสผ่าน
          </label>
          <span className="text-xs text-blue-400 cursor-pointer hover:text-blue-300 transition-colors">
            ลืมรหัสผ่าน?
          </span>
        </div>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            className={`${errors.password ? inputError : inputNormal} pr-12`}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg transition-colors dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-white/5 light:text-slate-400 light:hover:text-slate-600 light:hover:bg-slate-100"
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {errors.password && (
          <p className="flex items-center gap-1 text-xs text-red-400">
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {errors.password}
          </p>
        )}
      </div>

      {/* Remember me */}
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={form.remember}
          onChange={(e) => setForm((f) => ({ ...f, remember: e.target.checked }))}
          className="h-4.5 w-4.5 rounded border dark:border-white/20 dark:bg-white/5 light:border-slate-300 light:bg-white accent-blue-500 cursor-pointer"
        />
        <span className="text-sm dark:text-slate-400 light:text-slate-500">จดจำการเข้าสู่ระบบ</span>
      </label>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', boxShadow: loading ? 'none' : '0 4px 20px rgba(99,102,241,0.3)' }}
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> กำลังเข้าสู่ระบบ...</>
          : 'เข้าสู่ระบบ'
        }
      </button>
    </form>
  )
}
