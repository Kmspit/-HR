import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import OrganizationClient from './OrganizationClient'
import { canManageOrg } from '@/lib/org-permissions'
import { getOrgHierarchyGaps } from '@/lib/org-hierarchy-audit'

export default async function OrganizationPage() {
  const session = await auth()
  if (!session?.user) redirect('/')
  if (!canManageOrg(session.user.role)) redirect('/unauthorized')  const branches = await prisma.companyBranch.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, isDefault: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })

  const hierarchy = await getOrgHierarchyGaps(prisma)

  return (
    <div className="flex flex-col">
      <Topbar
        title="จัดการโครงสร้างองค์กร"
        subtitle="ฝ่าย · แผนก · ส่วนงาน — แยกตามสาขา"
      />
      <OrganizationClient
        branches={JSON.parse(JSON.stringify(branches))}
        hierarchyGaps={JSON.parse(JSON.stringify(hierarchy.gaps.slice(0, 20)))}
        hierarchyGapCount={hierarchy.gapCount}
        hierarchyTotalActive={hierarchy.totalActive}
      />
    </div>
  )
}
