import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DebtFollowupClient from './DebtFollowupClient'

export const metadata = { title: 'การติดตามหนี้' }

export default async function DebtFollowupPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'CLIENT') redirect('/client-portal')

  return (
    <DebtFollowupClient
      userId={session.user.id}
      userRole={session.user.role}
    />
  )
}
