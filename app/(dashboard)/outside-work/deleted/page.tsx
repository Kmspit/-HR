import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import { canAccessPage } from '@/lib/page-access'
import { resolveOrgListScope, userIdFilterFromScope } from '@/lib/org-scope'
import DeletedRequestsList from './DeletedRequestsList'
import type { Role } from '@prisma/client'

export default async function OutsideWorkDeletedPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (!canAccessPage(session.user.role, '/outside-work/deleted')) redirect('/unauthorized')

  // Same scoping as GET /api/outside-work/deleted — company-wide roles see
  // everything, MANAGER/TEAM_LEADER only their own direct reports' deleted requests.
  const scope = await resolveOrgListScope(prisma, session.user.id, session.user.role as Role)

  const rows = await prisma.outsideWorkRequest.findMany({
    where: { deletedAt: { not: null }, ...userIdFilterFromScope(scope) },
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
        subtitle="กู้คืนรายการที่ถูกลบไปแล้วได้ที่นี่ (ตามสิทธิ์อนุมัติงานนอกสถานที่ของคุณ)"
      />
      <DeletedRequestsList initialItems={items} />
    </div>
  )
}
