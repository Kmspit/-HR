import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ReceiptsClient from './ReceiptsClient'

export const metadata = { title: 'ใบเสร็จ' }

export default async function ReceiptsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'CLIENT') redirect('/client-portal')

  return (
    <ReceiptsClient
      userId={session.user.id}
      userRole={session.user.role}
    />
  )
}
