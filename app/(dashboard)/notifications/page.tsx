import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import NotificationList from '@/components/dashboard/NotificationList'

export default async function NotificationsPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const user = { name: session.user.name ?? '', email: session.user.email ?? '', role: session.user.role, department: session.user.department }

  return (
    <div className="flex flex-col">
      <Topbar title="แจ้งเตือน" subtitle={`${notifications.filter(n => !n.isRead).length} รายการที่ยังไม่ได้อ่าน`} user={user} />
      <NotificationList notifications={JSON.parse(JSON.stringify(notifications))} />
    </div>
  )
}
