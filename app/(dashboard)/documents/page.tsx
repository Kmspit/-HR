import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import DocumentsClient from './DocumentsClient'
import { HR_ADMIN } from '@/lib/module-gates'
import type { Role } from '@prisma/client'

export default async function DocumentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const isHr = HR_ADMIN.includes(session.user.role as Role)

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
