import { Skeleton, SkeletonStatGrid } from '@/components/ui/Skeleton'

export default function DashboardLoading() {
  return (
    <div className="p-4 md:p-6 space-y-5 page-enter">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3.5 w-64" />
      </div>

      <SkeletonStatGrid count={4} />

      <Skeleton className="h-64 rounded-2xl" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  )
}
