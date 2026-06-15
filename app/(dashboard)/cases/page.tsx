import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CasesClient from './CasesClient'

export default async function CasesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <CasesClient role={session.user.role} userId={session.user.id} userName={session.user.name ?? ''} />
}
