import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
      <div className="text-6xl mb-4">🚫</div>
      <h1 className="text-2xl font-bold text-white mb-2">ไม่มีสิทธิ์เข้าถึง</h1>
      <p className="text-slate-400 mb-6">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
      <Link href="/dashboard" className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition-all">
        กลับหน้าหลัก
      </Link>
    </div>
  )
}
