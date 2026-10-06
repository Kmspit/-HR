import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ExecutiveClient from './ExecutiveClient'
import { canAccessPageForUser } from '@/lib/page-access-server'

export default async function ExecutivePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!(await canAccessPageForUser(session.user.id, session.user.role, '/executive'))) redirect('/unauthorized')

  return <ExecutiveClient role={session.user.role} department={session.user.department ?? null} />
}
