import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import ForgotScanClient from './ForgotScanClient'
import type { Role } from '@prisma/client'

export const metadata = { title: 'แก้ไขเวลาลงงาน' }

const SUPERVISOR_ROLES: Role[] = ['MANAGER', 'TEAM_LEADER', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN']
const HR_ROLES: Role[] = ['HR', 'MANAGER_HR', 'ADMIN', 'SUPER_ADMIN']

export default async function ForgotScanPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id: userId, name, role } = session.user
  const isSupervisor = SUPERVISOR_ROLES.includes(role as Role)
  const isHR = HR_ROLES.includes(role as Role)

  return (
    <ForgotScanClient
      userId={userId}
      userName={name ?? ''}
      role={role}
      isSupervisor={isSupervisor}
      isHR={isHR}
    />
  )
}
