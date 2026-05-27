import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import OutsideWorkClient from './OutsideWorkClient'

export default async function OutsideWorkPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const canViewAll = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)

  const requests = await prisma.outsideWorkRequest.findMany({
    where: canViewAll ? {} : { userId: session.user.id },
    include: {
      user: { select: { name: true, department: true, position: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: canViewAll ? 200 : 100,
  })

  return (
    <div className="flex flex-col">
      <Topbar
        title="ออกนอกสถานที่"
        subtitle={
          canViewAll
            ? 'ยื่นคำขอได้เหมือนพนักงานทั่วไป · ดูประวัติทุกคนได้'
            : 'ยื่นคำขอและดูประวัติของตัวเอง'
        }
      />
      <OutsideWorkClient
        canViewAll={canViewAll}
        requests={requests.map((r) => ({
          id: r.id,
          userId: r.userId,
          userName: r.user.name,
          userDept: r.user.department ?? '',
          userPosition: r.user.position ?? '',
          date: r.date.toISOString(),
          startTime: r.startTime,
          endTime: r.endTime,
          place: r.place,
          purpose: r.purpose,
          client: r.client ?? '',
          note: r.note ?? '',
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  )
}
