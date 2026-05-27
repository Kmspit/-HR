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

  let branches: { id: string; name: string; code: string }[] = []
  try {
    branches = await prisma.companyBranch.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })
  } catch {
    return null
  }

  return (
    <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/8 bg-slate-950/40">
      <BranchFilter
        branches={branches}
        currentBranchId={filterBranchId || 'all'}
      />
    </div>
  )
}
