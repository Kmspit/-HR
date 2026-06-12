import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import KnowledgeClient from './KnowledgeClient'

export default async function KnowledgePage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  return (
    <div className="flex flex-col">
      <Topbar title="คลังความรู้" subtitle="Company Knowledge Base — บทความ, แนวทาง, FAQ" />
      <KnowledgeClient
        userId={session.user.id}
        userRole={session.user.role}
        userName={session.user.name ?? ''}
      />
    </div>
  )
}
