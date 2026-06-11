import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ContractsClient from './ContractsClient'

export const metadata = { title: 'สัญญา' }

export default async function ContractsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'CLIENT') redirect('/client-portal')

  return (
    <ContractsClient
      userId={session.user.id}
      userRole={session.user.role}
    />
  )
}
