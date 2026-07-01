import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import type { Role } from '@prisma/client'
import Topbar from '@/components/dashboard/Topbar'
import EmployeeEditClient from './EmployeeEditClient'
import { canManageUserProfile } from '@/lib/role-assignment'
import { canViewEmployeeTimeline } from '@/lib/employee-timeline/access'

export default async function EmployeeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/')
  if (!canManageUserProfile(session.user.role as Role)) redirect('/unauthorized')

  const allowed = await canViewEmployeeTimeline(
    prisma,
    session.user.id,
    session.user.role as Role,
    session.user.branchId,
    id,
  )
  if (!allowed) redirect('/unauthorized')

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, employeeId: true, role: true, status: true,
      employeeType: true,
      department: true, position: true, baseSalary: true, socialSecurity: true,
      isCoworker: true, startDate: true, phone: true, lineId: true,
      lineUserId: true, lineDisplayName: true,
      prefix: true, nickname: true, birthDate: true, address: true, addressIdCard: true, nationalId: true,
    },
  })

  if (!user) notFound()

  const warningCount = await prisma.warning.count({ where: { userId: id } })

  return (
    <div className="flex flex-col min-h-0">
      <Topbar title="แก้ไขข้อมูลพนักงาน" subtitle={user.name} />
      <EmployeeEditClient
      currentUserId={session.user.id}
      employee={{
        ...user,
        baseSalary: user.baseSalary ?? 0,
        startDate: user.startDate?.toISOString() ?? null,
        birthDate: user.birthDate?.toISOString() ?? null,
        employeeType: user.employeeType ?? 'permanent_employee',
        warningCount,
      }}
    />
    </div>
  )
}
