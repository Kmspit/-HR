import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AutomationClient from './AutomationClient'

export const metadata = { title: 'Automation Rules' }

const ALLOWED = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export default async function AutomationPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!ALLOWED.includes(session.user.role)) redirect('/unauthorized')

  return (
    <AutomationClient
      userId={session.user.id}
      userRole={session.user.role}
    />
  )
}
