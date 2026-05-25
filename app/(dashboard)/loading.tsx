export default function DashboardLoading() {
  return (
    <div className="p-4 md:p-6 space-y-5 animate-pulse">
      {/* Title skeleton */}
      <div className="space-y-2">
        <div className="h-6 w-48 rounded-lg dark:bg-white/[0.06] light:bg-slate-200" />
        <div className="h-3.5 w-64 rounded-lg dark:bg-white/[0.04] light:bg-slate-100" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-2xl dark:bg-white/[0.04] light:bg-slate-100"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>

      {/* Main content block */}
      <div className="h-64 rounded-2xl dark:bg-white/[0.03] light:bg-slate-100" />

      {/* Secondary blocks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-40 rounded-2xl dark:bg-white/[0.03] light:bg-slate-100" />
        <div className="h-40 rounded-2xl dark:bg-white/[0.03] light:bg-slate-100" />
      </div>
    </div>
  )
}
