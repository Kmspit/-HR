import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import TrainingClient from './TrainingClient'

export default async function TrainingPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  return (
    <div className="flex flex-col">
      <Topbar title="Training & Quiz" subtitle="หลักสูตรฝึกอบรม — พัฒนาทักษะและทดสอบความรู้" />
      <TrainingClient
        userId={session.user.id}
        userRole={session.user.role}
        userName={session.user.name ?? ''}
      />
    </div>
  )
}
