import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ClientHistoryClient from './ClientHistoryClient'

export const metadata = { title: 'ประวัติลูกค้า' }

export default async function ClientHistoryPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'CLIENT') redirect('/client-portal')

  return (
    <ClientHistoryClient
      userId={session.user.id}
      userRole={session.user.role}
    />
  )
}
