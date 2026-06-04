import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import DocumentsClient from './DocumentsClient'

export default async function DocumentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const isHr = ['MANAGER_HR', 'ADMIN', 'SUPER_ADMIN'].includes(session.user.role)

  return (
    <div className="flex flex-col min-h-0">
      <Topbar
        title="ขอเอกสาร"
        subtitle={isHr ? 'จัดการคำขอเอกสารของพนักงาน' : 'ยื่นคำขอเอกสารจากฝ่าย HR'}
      />
      <DocumentsClient isHr={isHr} />
    </div>
  )
}
