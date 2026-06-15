import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import CaseDocumentsClient from './CaseDocumentsClient'

export default async function CaseDocumentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return (
    <div className="flex flex-col min-h-0">
      <Topbar title="ศูนย์เอกสาร" subtitle="จัดการเอกสารคดีและกฎหมายทั้งหมด" />
      <CaseDocumentsClient
        userId={session.user.id}
        userName={session.user.name ?? ''}
        role={session.user.role}
        department={session.user.department ?? null}
        cloudName={process.env.CLOUDINARY_CLOUD_NAME ?? ''}
      />
    </div>
  )
}
