import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import CaseDocumentsClient from './CaseDocumentsClient'

export default async function CaseDocumentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  return (
    <div className="flex flex-col">
      <Topbar title="เอกสารคดี" subtitle="ศูนย์กลางจัดการเอกสารและลายมือชื่ออิเล็กทรอนิกส์" />
      <CaseDocumentsClient
        userId={session.user.id}
        userName={session.user.name ?? ''}
        userRole={session.user.role}
      />
    </div>
  )
}
