import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { canManageUsers } from '@/lib/access-control'
import type { Role } from '@prisma/client'
import Topbar from '@/components/dashboard/Topbar'
import ApprovalChainManager from '@/components/leave/ApprovalChainManager'

export default async function ApprovalChainsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canManageUsers(session.user.role as Role)) redirect('/dashboard')

  const chains = await prisma.approvalChainConfig.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      steps: {
        orderBy: { stepOrder: 'asc' },
        include: { approver: { select: { id: true, name: true } } },
      },
    },
  })

  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <Topbar
        title="Approval Chain"
        subtitle="กำหนดขั้นตอนการอนุมัติ — ลา · นอกสถานที่ · แผนงาน · แก้เวลา"
      />
      <div className="flex-1 p-4 md:p-6 w-full space-y-6">
        <ApprovalChainManager
          initialChains={JSON.parse(JSON.stringify(chains))}
          users={JSON.parse(JSON.stringify(users))}
        />
      </div>
    </div>
  )
}
