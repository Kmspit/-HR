import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import AppointmentsClient from './AppointmentsClient'

export default async function AppointmentsPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  return (
    <div className="flex flex-col">
      <Topbar title="นัดหมาย" subtitle="Appointments — ปฏิทินนัดหมายองค์กร ลูกค้า ลูกหนี้ ภายใน" />
      <AppointmentsClient
        userId={session.user.id}
        userRole={session.user.role}
        userName={session.user.name ?? ''}
      />
    </div>
  )
}
