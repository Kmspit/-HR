import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ReportsClient from './ReportsClient'

export default async function ReportsPage() {
  const session = await auth()
  if (!session?.user) redirect('/')
  if (!['MANAGER_HR', 'ADMIN'].includes(session.user.role)) redirect('/unauthorized')

  const now = new Date()
  return (
    <ReportsClient
      defaultMonth={now.getMonth() + 1}
      defaultYear={now.getFullYear()}
    />
  )
}
