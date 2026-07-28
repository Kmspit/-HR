import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import { canAccessPage } from '@/lib/page-access'
import DeletedDebtorsList from './DeletedDebtorsList'

export default async function DebtorsDeletedPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (!canAccessPage(session.user.role, '/debtors/deleted')) redirect('/unauthorized')

  // DEBTOR_DELETE_ROLES are all company-wide roles — no assignedTo scoping needed
  // (unlike outside-work's MANAGER/TEAM_LEADER scoped restore).
  const rows = await prisma.debtor.findMany({
    where: { deletedAt: { not: null } },
    select: {
      id: true, debtorNumber: true, firstName: true, lastName: true, phone: true,
      totalDebt: true, remainingDebt: true, deletedAt: true,
      assignedTo: { select: { name: true } },
      deletedBy: { select: { name: true } },
    },
    orderBy: { deletedAt: 'desc' },
    take: 200,
  }).catch(() => [])

  const items = rows.map((r) => ({
    id: r.id,
    debtorNumber: r.debtorNumber,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: r.phone,
    totalDebt: r.totalDebt,
    remainingDebt: r.remainingDebt,
    deletedAt: r.deletedAt!.toISOString(),
    assignedToName: r.assignedTo?.name ?? null,
    deletedByName: r.deletedBy?.name ?? null,
  }))

  return (
    <div className="flex flex-col">
      <Topbar
        title="ลูกหนี้ที่ถูกลบ"
        subtitle="กู้คืนลูกหนี้ที่ถูกลบไปแล้วได้ที่นี่ (เฉพาะผู้มีสิทธิ์ลบลูกหนี้)"
      />
      <DeletedDebtorsList initialItems={items} />
    </div>
  )
}
