import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import { canAccessPage } from '@/lib/page-access'
import DeletedRequestsList from './DeletedRequestsList'

export default async function OutsideWorkDeletedPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (!canAccessPage(session.user.role, '/outside-work/deleted')) redirect('/unauthorized')

  const rows = await prisma.outsideWorkRequest.findMany({
    where: { deletedAt: { not: null } },
    select: {
      id: true, date: true, place: true, purpose: true, documentNumber: true,
      deletedAt: true,
      clientCompany: { select: { companyName: true } },
      user: { select: { name: true } },
      deletedBy: { select: { name: true } },
    },
    orderBy: { deletedAt: 'desc' },
    take: 200,
  }).catch(() => [])

  const items = rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString(),
    place: r.place,
    purpose: r.purpose,
    documentNumber: r.documentNumber,
    deletedAt: r.deletedAt!.toISOString(),
    clientCompanyName: r.clientCompany?.companyName ?? null,
    requesterName: r.user.name,
    deletedByName: r.deletedBy?.name ?? null,
  }))

  return (
    <div className="flex flex-col">
      <Topbar
        title="รายการที่ถูกลบ (ออกนอกสถานที่)"
        subtitle="เฉพาะ SUPER_ADMIN / CEO / MANAGER_HR / HR — กู้คืนรายการที่ถูกลบไปแล้วได้ที่นี่"
      />
      <DeletedRequestsList initialItems={items} />
    </div>
  )
}
