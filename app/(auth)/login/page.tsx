import { Metadata } from 'next'
import LoginForm from '@/components/auth/LoginForm'
import Link from 'next/link'

export const metadata: Metadata = { title: 'เข้าสู่ระบบ' }

type Props = { searchParams: Promise<{ error?: string }> }

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-72 w-72 rounded-full opacity-10 blur-3xl" style={{ background: 'radial-gradient(circle,#22c55e,transparent)' }} />
        <div className="absolute -right-20 bottom-20 h-64 w-64 rounded-full opacity-8 blur-3xl" style={{ background: 'radial-gradient(circle,#8b5cf6,transparent)' }} />
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

      <Link href="/" className="relative mb-6 flex items-center gap-2.5 group">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-extrabold text-white transition-transform group-hover:scale-105"
          style={{ background: 'linear-gradient(135deg,#22c55e,#6366f1)', boxShadow: '0 4px 16px rgba(22,163,74,0.4)' }}>
          HR
        </div>
        <div>
          <p className="text-sm font-extrabold text-white leading-tight">เค เอ็ม <span className="gradient-text-blue">เซอร์วิส</span> พลัส</p>
          <p className="text-[11px] text-slate-600">จำกัด</p>
        </div>
      </Link>

      <div className="relative w-full max-w-[360px]">
        <div className="rounded-2xl p-6"
          style={{ background: 'rgba(13,19,33,0.92)', backdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 48px rgba(0,0,0,0.4)' }}>
          <div className="mb-6 text-center">
            <h1 className="text-lg font-bold text-white">เข้าสู่ระบบ</h1>
            <p className="mt-1 text-xs text-slate-500">บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด</p>
          </div>
          <LoginForm initialError={error} />
        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          ยังไม่มีบัญชี?{' '}
          <Link href="/register" className="font-semibold text-green-400 hover:text-green-300 transition-colors">
            สมัครใช้งาน
          </Link>
        </p>
      </div>
    </div>
  )
}
