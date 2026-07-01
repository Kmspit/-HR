import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ReportsClient from './ReportsClient'
import BranchFilterBar from '@/components/dashboard/BranchFilterBar'
import { parseBranchQueryParam } from '@/lib/branch-scope'
import { canAccessPage } from '@/lib/page-access'
import { Suspense } from 'react'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/')
  if (!canAccessPage(session.user.role, '/reports')) redirect('/unauthorized')

  const sp = await searchParams
  const branchParam = parseBranchQueryParam(sp.branchId)
  const now = new Date()
  return (
    <div className="flex flex-col">
      <Suspense fallback={null}>
        <BranchFilterBar role={session.user.role} filterBranchId={branchParam} />
      </Suspense>
      <ReportsClient
        defaultMonth={now.getMonth() + 1}
        defaultYear={now.getFullYear()}
      />
    </div>
  )
}
