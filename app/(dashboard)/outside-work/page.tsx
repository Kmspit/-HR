import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import OutsideWorkClient from './OutsideWorkClient'

export default async function OutsideWorkPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const isManager = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)

  const requests = await prisma.outsideWorkRequest.findMany({
    where: isManager ? {} : { userId: session.user.id },
    include: { user: { select: { name: true, department: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return (
    <OutsideWorkClient
      isManager={isManager}
      requests={requests.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user.name,
        userDept: r.user.department ?? '',
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
  )
}
