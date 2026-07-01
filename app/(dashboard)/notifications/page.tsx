import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import NotificationCenterClient from '@/components/notification-center/NotificationCenterClient'
import { computeTabCounts } from '@/lib/notification-center/tab-counts'

export default async function NotificationsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const rows = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const notifications = rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
    taskId: n.taskId,
  }))

  const tabCounts = computeTabCounts(rows)
  const unreadCount = tabCounts.all.unread

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="ศูนย์แจ้งเตือน"
        subtitle={unreadCount > 0 ? `${unreadCount} รายการยังไม่ได้อ่าน` : 'อ่านครบแล้ว — อัปเดตแบบเรียลไทม์'}
      />
      <NotificationCenterClient
        notifications={notifications}
        unreadCount={unreadCount}
        tabCounts={tabCounts}
      />
    </div>
  )
}
