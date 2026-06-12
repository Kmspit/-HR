import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SecurityClient from './SecurityClient'

const ALLOWED = ['CEO', 'SUPER_ADMIN', 'HR', 'MANAGER_HR']

export default async function SecurityPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!ALLOWED.includes(session.user.role)) redirect('/dashboard')

  return <SecurityClient />
}
