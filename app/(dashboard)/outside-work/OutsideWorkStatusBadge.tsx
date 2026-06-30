'use client'

import { REQUEST_STATUS_LABEL as STATUS_LABEL } from '@/lib/status-labels'

type SlotLike = {
  approvalStatus?: string | null
  status?: string
}

export default function OutsideWorkStatusBadge({ slot }: { slot: SlotLike }) {
  const s = slot.approvalStatus ?? slot.status
  if (!s) return <span className="text-gray-700 text-sm">—</span>
  const label = STATUS_LABEL[s] ?? s
  const cls =
    s === 'approved_by_ceo' || s === 'approved' || s === 'APPROVED' ? 'bg-green-100 text-green-800 border-green-300' :
    s === 'rejected_by_ceo' || s === 'rejected' || s === 'REJECTED' ? 'bg-red-100 text-red-800 border-red-300' :
    'bg-yellow-100 text-yellow-800 border-yellow-300'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-sm font-semibold leading-tight ${cls}`}>
      {label}
    </span>
  )
}
