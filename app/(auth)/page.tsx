'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function WelcomeContent() {
  const params = useSearchParams()
  const status = params.get('status')

  const statusMessages: Record<string, { title: string; msg: string; type: 'warn' | 'err' }> = {
    pending:  { title: 'บัญชีรอการอนุมัติ',    msg: 'บัญชีของคุณอยู่ระหว่างการตรวจสอบจาก HR',   type: 'warn' },
    disabled: { title: 'บัญชีถูกระงับ',          msg: 'กรุณาติดต่อ HR เพื่อเปิดใช้งาน',              type: 'err' },
    rejected: { title: 'คำขอถูกปฏิเสธ',         msg: 'กรุณาติดต่อ HR เพื่อข้อมูลเพิ่มเติม',        type: 'err' },
  }

  const banner = status ? statusMessages[status] : null

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-8">
      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-72 w-72 rounded-full opacity-10 blur-3xl" style={{ background: 'radial-gradient(circle,#3b82f6,transparent)' }} />
        <div className="absolute -right-32 bottom-0 h-72 w-72 rounded-full opacity-8 blur-3xl" style={{ background: 'radial-gradient(circle,#8b5cf6,transparent)' }} />
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* Logo */}
      <div className="relative mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-extrabold text-white"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', boxShadow: '0 0 32px rgba(99,102,241,0.4)' }}>
          HR
        </div>
        <h1 className="text-base font-extrabold tracking-tight text-white leading-snug">
          เค เอ็ม <span className="gradient-text">เซอร์วิส</span> พลัส
        </h1>
        <p className="mt-0.5 text-[9px] text-slate-500">บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด</p>
      </div>

      {/* Status banner */}
      {banner && (
        <div className="relative mb-4 w-full max-w-[360px] rounded-2xl px-4 py-3 text-sm"
          style={{
            background: banner.type === 'warn' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${banner.type === 'warn' ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}>
          <p className={`font-semibold text-sm ${banner.type === 'warn' ? 'text-yellow-400' : 'text-red-400'}`}>{banner.title}</p>
          <p className="mt-0.5 text-xs text-slate-400">{banner.msg}</p>
        </div>
      )}

      {/* Main card */}
      <div className="relative w-full max-w-[360px]">
        <div className="rounded-2xl p-6"
          style={{ background: 'rgba(13,19,33,0.9)', backdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 48px rgba(0,0,0,0.4)' }}>

          {/* Headline */}
          <div className="mb-6 text-center">
            <h2 className="text-lg font-bold text-white leading-snug">
              ยินดีต้อนรับ<br />
              <span className="gradient-text">ระบบ HR</span>
            </h2>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              จัดการเวลางาน เงินเดือน และบุคลากร
            </p>
          </div>

          {/* Buttons */}
          <div className="space-y-2.5">
            <Link href="/login"
              className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-5 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', boxShadow: '0 4px 16px rgba(99,102,241,0.3)' }}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-sm">🔑</span>
              <span className="flex-1">เข้าสู่ระบบ</span>
              <svg className="h-4 w-4 opacity-60 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link href="/register"
              className="group flex w-full items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-300 border border-white/[0.09] bg-white/[0.04] transition-all duration-200 hover:-translate-y-0.5 hover:text-white hover:border-white/[0.18] hover:bg-white/[0.07]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/8 text-sm">✨</span>
              <span className="flex-1">สมัครใช้งาน</span>
              <svg className="h-4 w-4 opacity-40 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Feature pills */}
          <div className="mt-5 flex flex-wrap gap-2 justify-center">
            {[['⏱️','เวลางาน'],['💰','เงินเดือน'],['📅','ลาหยุด'],['⚠️','ใบเตือน']].map(([icon,label]) => (
              <div key={label} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] text-slate-500"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span>{icon}</span>{label}
              </div>
            ))}
          </div>
        </div>

        {/* Demo accounts */}
        <div className="mt-2.5 rounded-2xl px-4 py-3.5 text-xs"
          style={{ background: 'rgba(13,19,33,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="mb-2 flex items-center gap-1.5 font-semibold text-slate-300 text-[11px]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />Demo Accounts
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[10px] text-slate-400">
            <span>manager@demo.com</span><span className="text-slate-600">Manager/HR</span>
            <span>admin@demo.com</span><span className="text-slate-600">Admin</span>
            <span>employee@demo.com</span><span className="text-slate-600">Employee</span>
            <span>lawyer@demo.com</span><span className="text-slate-600">Lawyer</span>
          </div>
          <p className="mt-1.5 text-slate-600 text-[10px]">Password: demo1234 · แอปจริง: http://localhost:3000</p>
        </div>
      </div>

      <p className="relative mt-6 text-[10px] text-slate-700">© 2026 บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด</p>
    </div>
  )
}

export default function WelcomePage() {
  return <Suspense><WelcomeContent /></Suspense>
}
