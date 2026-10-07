'use client'

import { SESSION_UNAVAILABLE_DIGEST } from '@/lib/session-constants'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // auth() ตรวจ session กับ DB ไม่ได้ — ไม่ใช่ session หมดอายุ ห้ามพาไปหน้า login
  const unavailable = error.digest === SESSION_UNAVAILABLE_DIGEST
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
      <div className="text-4xl">⚠️</div>
      <h2 className="text-xl font-semibold text-red-400">{unavailable ? 'ระบบขัดข้องชั่วคราว' : 'เกิดข้อผิดพลาด'}</h2>
      <p className="text-sm text-gray-400 max-w-md">
        {unavailable
          ? 'กรุณาลองใหม่อีกครั้งในอีกสักครู่'
          : error.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง'}
      </p>
      {error.digest && (
        <p className="text-xs text-gray-600 font-mono">ref: {error.digest}</p>
      )}
      <button
        onClick={() => (unavailable ? window.location.reload() : reset())}
        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
      >
        ลองใหม่
      </button>
    </div>
  )
}
