import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import AnnouncementsClient from './AnnouncementsClient'

export const metadata = { title: 'ประกาศ' }

export default async function AnnouncementsPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  const { role, name } = session.user

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const user = {
    name: name ?? '',
    email: session.user.email ?? '',
    role,
    department: session.user.department,
  }

  return (
    <div className="flex flex-col">
      <Topbar title="ประกาศ & ข่าวสาร" subtitle="ข้อมูลสำคัญจากบริษัท" user={user} />
      <AnnouncementsClient notifications={notifications} role={role} userId={session.user.id} />
    </div>
  )
}
