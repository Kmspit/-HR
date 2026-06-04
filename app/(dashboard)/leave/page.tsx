import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import LeavePanel from '@/components/dashboard/LeavePanel'
import { getLeaveBalanceStats } from '@/lib/leave-balance'
import { ensureDbSchema } from '@/lib/ensure-db-schema'

export default async function LeavePage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  await ensureDbSchema().catch(() => {})

  const currentYear = new Date().getFullYear()

  const [myLeaves, stats] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    getLeaveBalanceStats(session.user.id, currentYear),
  ])

  return (
    <div className="flex flex-col">
      <Topbar title="ขอลาหยุด" subtitle="ยื่นคำขอและดูประวัติการลา" />
      <LeavePanel
        leaves={JSON.parse(JSON.stringify(myLeaves))}
        stats={JSON.parse(JSON.stringify(stats))}
        branchId={session.user.branchId ?? null}
      />
    </div>
  )
}
