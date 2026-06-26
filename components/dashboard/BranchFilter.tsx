'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Building2, LayoutGrid } from 'lucide-react'

export type BranchOption = { id: string; name: string; code: string }

type Props = {
  branches: BranchOption[]
  currentBranchId?: string
  showAllOption?: boolean
}

function branchDisplay(b: BranchOption): { headline: string; detail: string } {
  if (b.code === 'HQ') {
    return {
      headline: 'สาขาหลัก',
      detail: 'เค เอ็ม เซอร์วิสพลัส จำกัด',
    }
  }
  if (b.code === 'NMA') {
    return {
      headline: 'สาขานครราชสีมา',
      detail: 'สาขาย่อย',
    }
  }
  return {
    headline: b.name.length > 28 ? `${b.name.slice(0, 28)}…` : b.name,
    detail: `รหัส ${b.code}`,
  }
}

export default function BranchFilter({
  branches,
  currentBranchId = 'all',
  showAllOption = true,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active = currentBranchId || 'all'

  const selectBranch = (branchId: string) => {
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

  const btnBase =
    'group flex min-h-[48px] min-w-[120px] flex-1 sm:flex-none sm:max-w-[220px] flex-col items-start justify-center rounded-xl border px-4 py-2.5 text-left transition-all duration-200 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950'

  const btnActive =
    'border-blue-400/70 bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 md:scale-[1.02]'

  const btnIdle =
    'border-white/15 bg-slate-800 md:bg-slate-800/90 text-slate-200 hover:border-blue-400/50 hover:bg-slate-700 md:hover:bg-slate-700/90 hover:text-white hover:shadow-md hover:shadow-black/20 md:active:scale-[0.98]'

  return (
    <div
      className="rounded-2xl border border-white/10 bg-slate-900 md:bg-slate-900/70 px-4 py-3.5 shadow-inner"
      role="group"
      aria-label="เลือกสาขาที่ต้องการดูข้อมูล"
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15">
          <Building2 className="h-4 w-4 text-blue-400" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">ดูข้อมูลตามสาขา</p>
          <p className="text-[11px] text-slate-400">แตะปุ่มเพื่อสลับมุมมอง — ข้อมูลจะกรองตามสาขาที่เลือก</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {showAllOption && (
          <button
            type="button"
            onClick={() => selectBranch('all')}
            aria-pressed={active === 'all'}
            className={`${btnBase} ${active === 'all' ? btnActive : btnIdle}`}
          >
            <span className="flex items-center gap-1.5">
              <LayoutGrid className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              <span className="text-sm font-bold leading-tight">ทุกสาขา</span>
            </span>
            <span
              className={`mt-0.5 text-[11px] leading-snug ${
                active === 'all' ? 'text-blue-100' : 'text-slate-500 group-hover:text-slate-300'
              }`}
            >
              รวมสาขาหลักและสาขาย่อย
            </span>
          </button>
        )}

        {branches.map((b) => {
          const isOn = active === b.id
          const { headline, detail } = branchDisplay(b)
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => selectBranch(b.id)}
              aria-pressed={isOn}
              title={b.name}
              className={`${btnBase} ${isOn ? btnActive : btnIdle}`}
            >
              <span className="text-sm font-bold leading-tight">{headline}</span>
              <span
                className={`mt-0.5 text-[11px] leading-snug ${
                  isOn ? 'text-blue-100' : 'text-slate-500 group-hover:text-slate-300'
                }`}
              >
                {detail}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
