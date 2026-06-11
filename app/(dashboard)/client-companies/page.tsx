import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ClientCompaniesClient from './ClientCompaniesClient'

export const metadata = { title: 'ลูกค้าองค์กร' }

export default async function ClientCompaniesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'CLIENT') redirect('/client-portal')

  return (
    <ClientCompaniesClient
      userId={session.user.id}
      userRole={session.user.role}
    />
  )
}
