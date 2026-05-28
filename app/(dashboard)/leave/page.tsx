import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import LeavePanel from '@/components/dashboard/LeavePanel'

export default async function LeavePage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  const currentYear = new Date().getFullYear()

  const [myLeaves, leaveBalance] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: session.user.id, year: currentYear } },
    }),
  ])

  const user = { name: session.user.name ?? '', email: session.user.email ?? '', role: session.user.role, department: session.user.department }

  return (
    <div className="flex flex-col">
      <Topbar title="ขอลาหยุด" subtitle="ยื่นคำขอและดูประวัติการลา" />
      <LeavePanel
        leaves={JSON.parse(JSON.stringify(myLeaves))}
        balance={JSON.parse(JSON.stringify(leaveBalance))}
        branchId={session.user.branchId ?? null}
      />
    </div>
  )
}
