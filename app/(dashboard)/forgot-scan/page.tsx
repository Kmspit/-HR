import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import ForgotScanClient from './ForgotScanClient'
import {
  FORGOT_SCAN_HR_ROLES,
  FORGOT_SCAN_SUPERVISOR_ROLES,
} from '@/lib/access-control'
import type { Role } from '@prisma/client'

export const metadata = { title: 'แก้ไขเวลาลงงาน' }

export default async function ForgotScanPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id: userId, name, role } = session.user
  const r = role as Role
  const isSupervisor = FORGOT_SCAN_SUPERVISOR_ROLES.includes(r)
  const isHR = FORGOT_SCAN_HR_ROLES.includes(r)

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
