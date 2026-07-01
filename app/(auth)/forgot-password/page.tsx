'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, ArrowLeft } from 'lucide-react'
import { englishOnlyFieldError, isEnglishOnly } from '@/lib/english-input'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

type Step = 'email' | 'otp' | 'reset' | 'done'

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email')
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [confirmError, setConfirmError] = useState('')

  const onEmailChange = (value: string) => {
    setEmail(value)
    setEmailError(englishOnlyFieldError(value) ?? '')
  }

  const onPasswordChange = (value: string) => {
    setPassword(value)
    setPasswordError(englishOnlyFieldError(value) ?? '')
  }

  const onConfirmChange = (value: string) => {
    setConfirm(value)
    setConfirmError(englishOnlyFieldError(value) ?? '')
  }

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = englishOnlyFieldError(email) ?? (!email ? 'กรุณากรอกอีเมล' : '')
    setEmailError(err)
    if (err || !isEnglishOnly(email)) return
    setLoading(true)
    try {
      const { ok, data, status } = await apiJson<{ challenge?: string; message?: string; sent?: boolean }>(
        '/api/auth/forgot-password/request',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        },
      )
      if (!ok) {
        toast.error(apiErrorMessage(data as Record<string, unknown>, 'ส่ง OTP ไม่สำเร็จ', status))
        return
      }
      toast.success(data.message ?? 'ส่งรหัส OTP แล้ว')
      setStep('otp')
    } catch {
      toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otp.trim() || otp.length !== 6) { toast.error('กรุณากรอกรหัส OTP 6 หลัก'); return }
    setStep('reset')
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    const pErr = englishOnlyFieldError(password) ?? ''
    const cErr = englishOnlyFieldError(confirm) ?? ''
    setPasswordError(pErr)
    setConfirmError(cErr)
    if (pErr || cErr || !isEnglishOnly(password) || !isEnglishOnly(confirm)) return
    if (password.length < 8) { toast.error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return }
    if (password !== confirm) { toast.error('รหัสผ่านไม่ตรงกัน'); return }
    setLoading(true)
    try {
      const { ok, data, status } = await apiJson(
        '/api/auth/forgot-password/reset',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            code: otp.trim(),
            newPassword: password,
            confirmPassword: confirm,
          }),
        },
      )
      if (!ok) {
        toast.error(apiErrorMessage(data as Record<string, unknown>, 'เปลี่ยนรหัสผ่านไม่สำเร็จ', status))
        return
      }
      toast.success('เปลี่ยนรหัสผ่านสำเร็จ')
      setStep('done')
    } catch {
      toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full rounded-xl border border-white/10 bg-slate-800/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/50'

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4">
      <Link href="/login" className="mb-8 flex items-center gap-2 group">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-lg">⚡</div>
        <span className="text-lg font-bold text-white">HR<span className="gradient-text">Flow</span></span>
      </Link>

      <div className="w-full max-w-sm animate-slide-up">
        <div className="glass rounded-3xl border border-white/10 p-8 shadow-2xl">
          {step === 'email' && (
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-2xl">🔐</div>
                <h1 className="text-xl font-bold text-white">ลืมรหัสผ่าน?</h1>
                <p className="mt-1 text-sm text-slate-400">กรอกอีเมลเพื่อรับรหัส OTP ทาง LINE</p>
              </div>
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div>
                  <input type="email" placeholder="name@company.com" className={`${inputCls} ${emailError ? 'border-red-500/50' : ''}`} value={email} onChange={(e) => onEmailChange(e.target.value)} required />
                  {emailError && <p className="mt-1 text-xs text-red-400">{emailError}</p>}
                </div>
                <button type="submit" disabled={loading || !!emailError} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all disabled:opacity-60">
                  {loading ? <><Loader2 size={16} className="animate-spin" /> กำลังส่ง...</> : 'ส่งรหัส OTP'}
                </button>
              </form>
            </>
          )}

          {step === 'otp' && (
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-500/10 text-2xl">📱</div>
                <h1 className="text-xl font-bold text-white">ยืนยัน OTP</h1>
                <p className="mt-1 text-sm text-slate-400">กรอกรหัส 6 หลักที่ส่งไปยัง<br /><span className="text-blue-400">{email}</span></p>
              </div>
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <input type="text" placeholder="000000" maxLength={6} className={`${inputCls} text-center text-2xl tracking-[0.5em] font-bold`} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required />
                <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all">
                  ยืนยัน OTP
                </button>
              </form>
            </>
          )}

          {step === 'reset' && (
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-2xl">🔑</div>
                <h1 className="text-xl font-bold text-white">ตั้งรหัสผ่านใหม่</h1>
              </div>
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <input type="password" placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" className={`${inputCls} ${passwordError ? 'border-red-500/50' : ''}`} value={password} onChange={(e) => onPasswordChange(e.target.value)} required />
                  {passwordError && <p className="mt-1 text-xs text-red-400">{passwordError}</p>}
                </div>
                <div>
                  <input type="password" placeholder="ยืนยันรหัสผ่านใหม่" className={`${inputCls} ${confirmError ? 'border-red-500/50' : ''}`} value={confirm} onChange={(e) => onConfirmChange(e.target.value)} required />
                  {confirmError && <p className="mt-1 text-xs text-red-400">{confirmError}</p>}
                </div>
                <button type="submit" disabled={loading || !!passwordError || !!confirmError} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-500 transition-all disabled:opacity-60">
                  {loading ? <><Loader2 size={16} className="animate-spin" /> กำลังบันทึก...</> : 'บันทึกรหัสผ่านใหม่'}
                </button>
              </form>
            </>
          )}

          {step === 'done' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/10 text-3xl">✅</div>
              <h1 className="text-xl font-bold text-white">สำเร็จ!</h1>
              <p className="mt-2 text-sm text-slate-400">รหัสผ่านของคุณถูกเปลี่ยนแล้ว</p>
              <Link href="/login" className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all">
                กลับไปเข้าสู่ระบบ
              </Link>
            </div>
          )}
        </div>

        {step !== 'done' && (
          <Link href="/login" className="mt-4 flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeft size={14} /> กลับไปหน้าเข้าสู่ระบบ
          </Link>
        )}
      </div>
    </div>
  )
}
