import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CaseFinanceClient from './CaseFinanceClient'

export const metadata = { title: 'การเงินคดี — HRFlow' }

const CAN_VIEW = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

export default async function CaseFinancePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!CAN_VIEW.includes(session.user.role)) redirect('/unauthorized')

  return (
    <CaseFinanceClient
      userId={session.user.id}
      userRole={session.user.role as string}
      userName={session.user.name ?? ''}
    />
  )
}
