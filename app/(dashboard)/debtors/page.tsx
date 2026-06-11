import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DebtorsClient from './DebtorsClient'

export const metadata = { title: 'รายชื่อลูกหนี้' }

export default async function DebtorsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'CLIENT') redirect('/client-portal')

  return (
    <DebtorsClient
      userId={session.user.id}
      userRole={session.user.role}
      userName={session.user.name ?? ''}
    />
  )
}
