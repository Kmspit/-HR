'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('[HRFlow] Page error:', error.message, error.digest)
  }, [error])

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 p-8 text-center shadow-lg">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
          ⚠️
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          เกิดข้อผิดพลาด
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          หน้านี้ไม่สามารถโหลดได้ในขณะนี้
        </p>
        {error.message && (
          <p className="text-xs text-red-500 dark:text-red-400 mb-3 font-mono bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 break-all">
            {error.message}
          </p>
        )}
        {error.digest && (
          <p className="text-[11px] text-slate-400 mb-6 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-medium rounded-xl transition-colors"
          >
            ลองใหม่
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-white text-sm font-medium rounded-xl transition-colors"
          >
            กลับ Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
