import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import ProbationClient from './ProbationClient'

export default async function ProbationPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')
  if (!['MANAGER_HR', 'ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) redirect('/dashboard')

  return (
    <div className="flex flex-col min-h-0">
      <Topbar title="ประเมินทดลองงาน" subtitle="ติดตามพนักงานที่ครบกำหนดทดลองงาน 3 เดือน" />
      <ProbationClient />
    </div>
  )
}
