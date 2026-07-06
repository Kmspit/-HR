'use client'

import dynamic from 'next/dynamic'
import type { OWRequest } from './OutsideWorkExcelForm'
import OutsideWorkStatusBadge from './OutsideWorkStatusBadge'

const ApprovalTimeline = dynamic(() => import('@/components/leave/ApprovalTimeline'), {
  loading: () => <div className="h-10 animate-pulse rounded bg-slate-800/60" />,
})

type Props = {
  viewReqs: OWRequest[]
  approvingId: string | null
  showApproveFor: (req: OWRequest) => boolean
  onApprove: (reqId: string, action: 'approve' | 'reject') => void
}

export default function OutsideWorkApprovalHistory({
  viewReqs,
  approvingId,
  showApproveFor,
  onApprove,
}: Props) {
  if (viewReqs.length === 0) return null

  return (
    <div className="bg-white text-gray-900 border border-gray-300 rounded-lg shadow-sm p-4 print:hidden">
      <h3 className="text-base font-semibold text-gray-900 mb-3">ประวัติรายการของสัปดาห์นี้</h3>
      <div className="divide-y divide-gray-300">
        {viewReqs.map((r) => (
          <div key={r.id} className="py-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-900 min-w-0">
                <span className="font-mono text-sm text-gray-900 shrink-0">{r.documentNumber ?? '—'}</span>
                <span className="shrink-0 font-medium text-gray-900">{r.date.slice(0, 10)}</span>
                <span className="text-gray-900 shrink-0">({r.timeSlot ?? '—'})</span>
                <span className="font-medium truncate text-gray-900">{r.place}</span>
                {r.clientCompanyName && (
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                    {r.clientCompanyName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <OutsideWorkStatusBadge slot={{ approvalStatus: r.approvalStatus, status: r.status }} />
                {showApproveFor(r) && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => onApprove(r.id, 'approve')}
                      disabled={approvingId === r.id}
                      className="px-3 py-1 rounded bg-green-100 text-green-800 hover:bg-green-200 border border-green-300 text-sm font-bold transition disabled:opacity-40"
                    >
                      อนุมัติ
                    </button>
                    <button
                      type="button"
                      onClick={() => onApprove(r.id, 'reject')}
                      disabled={approvingId === r.id}
                      className="px-3 py-1 rounded bg-red-100 text-red-800 hover:bg-red-200 border border-red-300 text-sm font-bold transition disabled:opacity-40"
                    >
                      ปฏิเสธ
                    </button>
                  </div>
                )}
              </div>
            </div>
            {r.steps && r.steps.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-slate-900 p-3">
                <ApprovalTimeline
                  steps={r.steps}
                  currentStepOrder={r.currentStepOrder ?? 0}
                  requestStatus={r.status}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
