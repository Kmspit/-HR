import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import ApprovalCenterClient from '@/components/approval-center/ApprovalCenterClient'
import { loadApprovalCenterData } from '@/lib/approval-center/load-data'
import { canAccessApprovalCenter } from '@/lib/approval-center/access'
import type { Role } from '@prisma/client'
import { Suspense } from 'react'

function CenterSkeleton() {
  return <div className="p-6 animate-pulse space-y-4 max-w-4xl mx-auto">
    <div className="h-20 rounded-xl bg-slate-200 dark:bg-slate-800" />
    <div className="h-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
    <div className="h-40 rounded-xl bg-slate-200 dark:bg-slate-800" />
  </div>
}

export default async function ApprovalCenterPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { role, id: userId } = session.user
  if (!canAccessApprovalCenter(role as Role)) redirect('/dashboard')

  const data = await loadApprovalCenterData(prisma, userId, role as Role)

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="ศูนย์อนุมัติ"
        subtitle="ลา · ออกนอกสถานที่ · แก้เวลา · แผนงานสัปดาห์"
      />
      <Suspense fallback={<CenterSkeleton />}>
        <ApprovalCenterClient {...JSON.parse(JSON.stringify(data))} />
      </Suspense>
    </div>
  )
}
