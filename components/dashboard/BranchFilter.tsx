'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Building2 } from 'lucide-react'

export type BranchOption = { id: string; name: string; code: string }

type Props = {
  branches: BranchOption[]
  currentBranchId?: string
  showAllOption?: boolean
}

export default function BranchFilter({
  branches,
  currentBranchId = 'all',
  showAllOption = true,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const onChange = (branchId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (!branchId || branchId === 'all') {
      params.delete('branchId')
    } else {
      params.set('branchId', branchId)
    }
    const q = params.toString()
    router.push(q ? `${pathname}?${q}` : pathname)
  }

  if (branches.length === 0) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Building2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
      <label className="text-xs text-slate-500 whitespace-nowrap">สาขา:</label>
      <select
        value={currentBranchId || 'all'}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 min-h-[40px] max-w-[280px]"
      >
        {showAllOption && <option value="all">ทุกสาขา</option>}
        {branches.map((b) => (
          <option key={b.id} value={b.id} className="bg-slate-900">
            {b.name} ({b.code})
          </option>
        ))}
      </select>
    </div>
  )
}
