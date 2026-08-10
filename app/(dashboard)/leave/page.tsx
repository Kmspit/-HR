import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import LeavePanel from '@/components/dashboard/LeavePanel'
import { getLeaveBalanceStats } from '@/lib/leave-balance'
export default async function LeavePage() {
  const session = await auth()
  if (!session?.user) redirect('/')
  const currentYear = new Date().getFullYear()

  const [myLeavesRaw, stats] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        // เหตุผลปฏิเสธถูกบันทึกไว้ที่ step ที่ถูกปฏิเสธจริง — ปกติมีได้แค่ 1 step
        // ต่อคำขอ เพราะ rejectLeaveChain ข้าม step ที่เหลือทั้งหมดทันทีที่ถูกปฏิเสธ
        stepLogs: { where: { status: 'REJECTED' }, select: { comment: true }, take: 1 },
      },
    }),
    getLeaveBalanceStats(session.user.id, currentYear),
  ])

  const myLeaves = myLeavesRaw.map(({ stepLogs, ...leave }) => ({
    ...leave,
    rejectionReason: stepLogs[0]?.comment ?? null,
  }))

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
