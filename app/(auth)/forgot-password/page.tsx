'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, ArrowLeft } from 'lucide-react'

type Step = 'email' | 'otp' | 'reset' | 'done'

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email')
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    // Mock: simulate sending OTP
    await new Promise((r) => setTimeout(r, 1200))
    toast.success(`ส่งรหัส OTP ไปยัง ${email} แล้ว (Mock: ใช้รหัส 123456)`)
    setLoading(false)
    setStep('otp')
  }

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp !== '123456') { toast.error('รหัส OTP ไม่ถูกต้อง'); return }
    setStep('reset')
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { toast.error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return }
    if (password !== confirm) { toast.error('รหัสผ่านไม่ตรงกัน'); return }
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1000))
    setLoading(false)
    toast.success('เปลี่ยนรหัสผ่านสำเร็จ')
    setStep('done')
  }

  const inputCls = 'w-full rounded-xl border border-white/10 bg-slate-800/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/50'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
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
                <p className="mt-1 text-sm text-slate-400">กรอกอีเมลเพื่อรับรหัส OTP</p>
              </div>
              <form onSubmit={handleSendOTP} className="space-y-4">
                <input type="email" placeholder="name@company.com" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required />
                <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all disabled:opacity-60">
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
                <p className="text-center text-xs text-slate-500">Demo: ใช้รหัส <strong className="text-blue-400">123456</strong></p>
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
                <input type="password" placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} required />
                <input type="password" placeholder="ยืนยันรหัสผ่านใหม่" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-500 transition-all disabled:opacity-60">
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
