import { prisma } from '@/lib/prisma'
import { canPickBranchFilter } from '@/lib/branch-scope'
import type { Role } from '@prisma/client'
import BranchFilter from './BranchFilter'

type Props = {
  role: Role
  filterBranchId?: string
}

export default async function BranchFilterBar({ role, filterBranchId }: Props) {
  if (!canPickBranchFilter(role)) return null

  const branches = await prisma.companyBranch.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })

  return (
    <div className="px-4 md:px-6 pb-3 border-b border-white/5">
      <BranchFilter
        branches={branches}
        currentBranchId={filterBranchId || 'all'}
      />
    </div>
  )
}
