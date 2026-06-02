import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import AnnouncementsClient from './AnnouncementsClient'

export const metadata = { title: 'ประกาศ' }

export default async function AnnouncementsPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  const { role, id: userId } = session.user

  const now = new Date()

  const rawAnnouncements = await prisma.announcement.findMany({
    where: { isArchived: false, publishAt: { lte: now } },
    orderBy: { publishAt: 'desc' },
    take: 50,
  })

  const announcements = rawAnnouncements.map((a) => {
    const readByIds: string[] = a.readByIds ? JSON.parse(a.readByIds) : []
    return {
      id: a.id,
      title: a.title,
      body: a.body,
      type: a.type,
      targetType: a.targetType,
      publishAt: a.publishAt.toISOString(),
      isRead: readByIds.includes(userId),
      readCount: readByIds.length,
      createdById: a.createdById,
      createdAt: a.createdAt.toISOString(),
      isArchived: a.isArchived,
    }
  })

  const unread = announcements.filter((a) => !a.isRead).length

  return (
    <div className="flex flex-col">
      <Topbar
        title="ประกาศ & ข่าวสาร"
        subtitle={unread > 0 ? `ยังไม่อ่าน ${unread} รายการ` : 'ข้อมูลสำคัญจากบริษัท'}
      />
      <AnnouncementsClient announcements={announcements} role={role} userId={userId} />
    </div>
  )
}
