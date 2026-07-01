import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import ProbationClient from './ProbationClient'
import { canAccessPage } from '@/lib/page-access'

export default async function ProbationPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')
  if (!canAccessPage(session.user.role, '/probation')) redirect('/dashboard')

  return (
    <div className="flex flex-col min-h-0">
      <Topbar title="ประเมินทดลองงาน" subtitle="ติดตามพนักงานที่ครบกำหนดทดลองงาน 3 เดือน" />
      <ProbationClient />
    </div>
  )
}
