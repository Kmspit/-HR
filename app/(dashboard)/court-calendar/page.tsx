import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import CourtCalendarClient from './CourtCalendarClient'

export default async function CourtCalendarPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  return (
    <div className="flex flex-col">
      <Topbar title="นัดศาล" subtitle="Court Calendar — ปฏิทินนัดศาลและคดีความ" />
      <CourtCalendarClient
        userId={session.user.id}
        userRole={session.user.role}
        userName={session.user.name ?? ''}
      />
    </div>
  )
}
