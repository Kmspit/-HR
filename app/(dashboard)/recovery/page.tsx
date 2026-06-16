import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import RecoveryClient from './RecoveryClient'

export const metadata = { title: 'Recovery & Collection' }

const ALLOWED = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER', 'LAWYER', 'ENFORCEMENT']

export default async function RecoveryPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!ALLOWED.includes(session.user.role)) redirect('/unauthorized')

  return (
    <RecoveryClient
      userId={session.user.id}
      userRole={session.user.role}
      userName={session.user.name ?? ''}
    />
  )
}
