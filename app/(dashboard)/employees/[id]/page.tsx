import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import EmployeeEditClient from './EmployeeEditClient'

export default async function EmployeeEditPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/')
  if (!['MANAGER_HR', 'ADMIN'].includes(session.user.role)) redirect('/unauthorized')

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, email: true, employeeId: true, role: true, status: true,
      department: true, position: true, baseSalary: true, socialSecurity: true,
      isCoworker: true, startDate: true, phone: true, lineId: true,
      prefix: true, nickname: true, birthDate: true, address: true, nationalId: true,
    },
  })

  if (!user) notFound()

  const warningCount = await prisma.warning.count({ where: { userId: params.id } })

  return (
    <EmployeeEditClient
      employee={{
        ...user,
        baseSalary: user.baseSalary ?? 0,
        startDate: user.startDate?.toISOString() ?? null,
        birthDate: user.birthDate?.toISOString() ?? null,
        warningCount,
      }}
    />
  )
}
