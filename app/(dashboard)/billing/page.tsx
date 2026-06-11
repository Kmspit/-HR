import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import BillingClient from './BillingClient'

export const metadata = { title: 'วางบิล / ภาพรวมการเงิน' }

export default async function BillingPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'CLIENT') redirect('/client-portal')

  return (
    <BillingClient
      userId={session.user.id}
      userRole={session.user.role}
    />
  )
}
