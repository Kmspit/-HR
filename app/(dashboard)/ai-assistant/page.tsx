import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AiAssistantClient from './AiAssistantClient'

export const metadata = { title: 'AI Assistant — HRFlow' }

export default async function AiAssistantPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'CLIENT') redirect('/client-portal')

  return (
    <AiAssistantClient
      userId={session.user.id}
      userName={session.user.name ?? ''}
      userRole={session.user.role as string}
    />
  )
}
