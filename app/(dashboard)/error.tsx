'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
      <div className="text-4xl">⚠️</div>
      <h2 className="text-xl font-semibold text-red-400">เกิดข้อผิดพลาด</h2>
      <p className="text-sm text-gray-400 max-w-md">
        {error.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง'}
      </p>
      {error.digest && (
        <p className="text-xs text-gray-600 font-mono">ref: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        ลองใหม่
      </button>
    </div>
  )
}
