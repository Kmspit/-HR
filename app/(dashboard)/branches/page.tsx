import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import BranchesClient from './BranchesClient'
import { canManageBranches } from '@/lib/branch-scope'

export default async function BranchesPage() {
  const session = await auth()
  if (!session?.user) redirect('/')
  if (!canManageBranches(session.user.role)) redirect('/unauthorized')

  const branches = await prisma.companyBranch.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { users: true } } },
  })

  return (
    <div className="flex flex-col">
      <Topbar
        title="จัดการสาขา"
        subtitle="เค เอ็ม เซอร์วิสพลัส จำกัด — สร้าง แก้ไข ลบสาขาบริษัท"
      />
      <BranchesClient
        initial={branches.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          nameEn: b.nameEn ?? '',
          address: b.address ?? '',
          phone: b.phone ?? '',
          isActive: b.isActive,
          isDefault: b.isDefault,
          lat: b.lat ?? null,
          lng: b.lng ?? null,
          radiusMeters: b.radiusMeters,
          googleMapPlaceId: b.googleMapPlaceId ?? null,
          userCount: b._count.users,
        }))}
      />
    </div>
  )
}
