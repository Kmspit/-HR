import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ClientDashboard from './ClientDashboard'

export default async function ClientPortalPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (session.user.role !== 'CLIENT') redirect('/dashboard')

  return (
    <ClientDashboard
      userId={session.user.id}
      userName={session.user.name ?? ''}
    />
  )
}
