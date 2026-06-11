import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import ClientsClient from './ClientsClient'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']

export default async function ClientsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')
  if (!CAN_MANAGE.includes(session.user.role)) redirect('/unauthorized')

  return (
    <div className="flex flex-col">
      <Topbar title="จัดการลูกค้า" subtitle="สร้างบัญชีลูกค้าและเชื่อมคดี" />
      <ClientsClient userId={session.user.id} userRole={session.user.role} />
    </div>
  )
}
