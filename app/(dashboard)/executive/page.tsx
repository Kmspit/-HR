import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ExecutiveClient from './ExecutiveClient'
import { canAccessPage } from '@/lib/page-access'

export default async function ExecutivePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canAccessPage(session.user.role, '/executive')) redirect('/unauthorized')

  return <ExecutiveClient role={session.user.role} department={session.user.department ?? null} />
}
