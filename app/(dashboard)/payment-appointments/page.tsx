import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PaymentAppointmentsClient from './PaymentAppointmentsClient'

export const metadata = { title: 'นัดชำระหนี้' }

export default async function PaymentAppointmentsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'CLIENT') redirect('/client-portal')

  return (
    <PaymentAppointmentsClient
      userId={session.user.id}
      userRole={session.user.role}
    />
  )
}
