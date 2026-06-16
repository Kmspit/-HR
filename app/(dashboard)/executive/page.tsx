import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ExecutiveClient from './ExecutiveClient'

const ALLOWED = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']

export default async function ExecutivePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!ALLOWED.includes(session.user.role)) redirect('/unauthorized')

  return <ExecutiveClient role={session.user.role} department={session.user.department ?? null} />
}
