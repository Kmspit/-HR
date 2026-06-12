import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import SopClient from './SopClient'

export default async function SopPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  return (
    <div className="flex flex-col">
      <Topbar title="SOP ขั้นตอนงาน" subtitle="Standard Operating Procedures — ขั้นตอนปฏิบัติงานมาตรฐาน" />
      <SopClient
        userId={session.user.id}
        userRole={session.user.role}
        userName={session.user.name ?? ''}
      />
    </div>
  )
}
