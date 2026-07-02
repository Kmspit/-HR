import { Metadata } from 'next'
import RegisterForm from '@/components/auth/RegisterForm'
import Link from 'next/link'

export const metadata: Metadata = { title: 'สมัครใช้งาน' }

export default function RegisterPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-8 sm:py-12">
      <Link href="/" className="mb-6 flex items-center gap-2 group">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-green-500/30 bg-green-500/10 text-lg">⚡</div>
        <span className="text-lg font-bold text-white">HR<span className="gradient-text">Flow</span></span>
      </Link>

      <div className="w-full max-w-2xl animate-slide-up">
        <div className="glass rounded-3xl border border-white/10 p-4 sm:p-8 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">สมัครใช้งาน</h1>
            <p className="mt-1.5 text-sm text-slate-400">
              กรอกข้อมูลให้ครบถ้วน HR จะตรวจสอบและอนุมัติภายใน 1-2 วันทำการ
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
              <span>⚠️</span>
              <span>Manager / HR สร้างบัญชีได้โดย HR เท่านั้น ไม่สามารถสมัครเองได้</span>
            </div>
          </div>
          <RegisterForm />
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          มีบัญชีแล้ว?{' '}
          <Link href="/login" className="font-semibold text-green-400 hover:text-green-300 transition-colors">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </div>
  )
}
