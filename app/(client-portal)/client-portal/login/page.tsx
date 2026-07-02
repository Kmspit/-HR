'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { englishOnlyFieldError, isEnglishOnly } from '@/lib/english-input'

export default function PortalLoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const onEmailChange = (value: string) => {
    setEmail(value)
    setEmailError(englishOnlyFieldError(value) ?? '')
  }

  const onPasswordChange = (value: string) => {
    setPassword(value)
    setPasswordError(englishOnlyFieldError(value) ?? '')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const eErr = englishOnlyFieldError(email) ?? (!email ? 'กรุณากรอกอีเมล' : '')
    const pErr = englishOnlyFieldError(password) ?? (!password ? 'กรุณากรอกรหัสผ่าน' : '')
    setEmailError(eErr)
    setPasswordError(pErr)
    if (eErr || pErr) return
    if (!isEnglishOnly(email) || !isEnglishOnly(password)) return

    setLoading(true)

    const res = await fetch('/api/client-portal/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'เกิดข้อผิดพลาด')
      return
    }

    router.push('/client-portal')
    router.refresh()
  }

  const englishBlocked = !!emailError || !!passwordError

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-green-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-green-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">KM</div>
          <h1 className="text-xl font-bold text-gray-900">KM Service Plus</h1>
          <p className="text-sm text-gray-500 mt-1">ระบบติดตามสถานะคดีสำหรับลูกค้า</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">เข้าสู่ระบบ Client Portal</h2>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
              <input
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="email@company.com"
                required
                autoComplete="email"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${emailError ? 'border-red-400' : 'border-gray-300'}`}
              />
              {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
              <input
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${passwordError ? 'border-red-400' : 'border-gray-300'}`}
              />
              {passwordError && <p className="mt-1 text-xs text-red-600">{passwordError}</p>}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || englishBlocked}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-colors mt-1"
            >
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-5">
            ปัญหาการเข้าใช้งาน? ติดต่อทีมงาน KM Service Plus
          </p>
        </div>
      </div>
    </div>
  )
}
