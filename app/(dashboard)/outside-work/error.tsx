'use client'

export default function OutsideWorkError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <p className="text-red-400">เกิดข้อผิดพลาด: {error.message}</p>
      <button onClick={reset} className="btn-primary">ลองใหม่</button>
    </div>
  )
}
