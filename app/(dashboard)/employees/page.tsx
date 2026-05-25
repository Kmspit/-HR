import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import EmployeeManager from '@/components/dashboard/EmployeeManager'

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/')
  if (session.user.role !== 'MANAGER_HR') redirect('/dashboard')

  const { tab } = await searchParams

  const users = await prisma.user.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true, name: true, email: true, employeeId: true, role: true,
      status: true, department: true, position: true, phone: true,
      baseSalary: true, socialSecurity: true, startDate: true, lineId: true,
      isCoworker: true, createdAt: true,
    },
  })

  const user = { name: session.user.name ?? '', email: session.user.email ?? '', role: session.user.role, department: session.user.department }

  const stats = {
    total:   users.filter(u => u.status === 'ACTIVE').length,
    pending: users.filter(u => u.status === 'PENDING').length,
    active:  users.filter(u => u.status === 'ACTIVE').length,
    disabled: users.filter(u => u.status === 'DISABLED').length,
  }

  return (
    <div className="flex flex-col">
      <Topbar
        title="จัดการพนักงาน"
        subtitle={`พนักงานทั้งหมด ${stats.active} คน · รออนุมัติ ${stats.pending} คน`}
      />
      <EmployeeManager users={JSON.parse(JSON.stringify(users))} stats={stats} initialTab={tab ?? 'all'} />
    </div>
  )
}
