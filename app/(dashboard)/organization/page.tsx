import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import OrganizationClient from './OrganizationClient'
import { canManageOrg } from '@/lib/org-permissions'
import { ensureDbSchema } from '@/lib/ensure-db-schema'

export default async function OrganizationPage() {
  const session = await auth()
  if (!session?.user) redirect('/')
  if (!canManageOrg(session.user.role)) redirect('/unauthorized')

  await ensureDbSchema()

  const branches = await prisma.companyBranch.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, isDefault: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })

  return (
    <div className="flex flex-col">
      <Topbar
        title="จัดการโครงสร้างองค์กร"
        subtitle="ฝ่าย · แผนก · ส่วนงาน — แยกตามสาขา"
      />
      <OrganizationClient branches={JSON.parse(JSON.stringify(branches))} />
    </div>
  )
}
