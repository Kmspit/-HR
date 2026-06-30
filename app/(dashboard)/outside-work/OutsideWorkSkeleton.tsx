export default function OutsideWorkSkeleton() {
  return (
    <div className="bg-gray-50 min-h-[480px] animate-pulse">
      <div className="max-w-[1440px] mx-auto px-3 py-4 md:px-6 md:py-6 space-y-4">
        <div className="h-12 bg-white border border-gray-200 rounded-xl" />
        <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
          <div className="h-20 bg-gray-100 border-b border-gray-200" />
          <div className="h-10 bg-gray-200 border-b border-gray-200" />
          <div className="space-y-0">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-16 border-b border-gray-100 bg-gray-50/80" />
            ))}
          </div>
          <div className="h-14 bg-slate-50 border-t border-gray-200" />
        </div>
      </div>
    </div>
  )
}
