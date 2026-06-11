import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ExpenseClaimClient from './ExpenseClaimClient'

export const metadata = { title: 'เบิกค่าใช้จ่าย — HRFlow' }

export default async function ExpenseClaimPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'CLIENT') redirect('/client-portal')

  return (
    <ExpenseClaimClient
      userId={session.user.id}
      userRole={session.user.role as string}
      userName={session.user.name ?? ''}
    />
  )
}
