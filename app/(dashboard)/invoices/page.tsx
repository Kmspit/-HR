import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import InvoicesClient from './InvoicesClient'

export const metadata = { title: 'ใบแจ้งหนี้' }

export default async function InvoicesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'CLIENT') redirect('/client-portal')

  return (
    <InvoicesClient
      userId={session.user.id}
      userRole={session.user.role}
    />
  )
}
