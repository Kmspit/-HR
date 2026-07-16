'use client'

import { MotionModal } from '@/components/motion'
import { TYPE_COLORS, TYPE_ICONS, TYPE_LABELS } from '@/lib/approval-center/constants'
import type { UnifiedApprovalItem } from '@/lib/approval-center/types'
import { formatThaiDate } from '@/lib/utils'
import Link from 'next/link'
import { ExternalLink, X } from 'lucide-react'

type Props = {
  item: UnifiedApprovalItem | null
  onClose: () => void
}

export default function ApprovalDetailDrawer({ item, onClose }: Props) {
  return (
    <MotionModal
      open={!!item}
      onClose={onClose}
      panelClassName="max-w-lg p-0 border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900"
      zIndex="z-[70]"
      ariaLabel={item ? `รายละเอียดคำขอ: ${item.employeeName}` : undefined}
    >
      {item && (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-white/[0.06] px-5 py-4">
            <div>
              <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold ${TYPE_COLORS[item.type]}`}>
                {TYPE_ICONS[item.type]} {TYPE_LABELS[item.type]}
              </span>
              <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{item.employeeName}</h3>
              <p className="text-[13px] text-slate-500">{item.requestTypeLabel} · {item.summary}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 btn-press">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-3">
                <p className="text-slate-500 text-[11px]">แผนก</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{item.department || '—'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-3">
                <p className="text-slate-500 text-[11px]">ส่งเมื่อ</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{formatThaiDate(item.submittedAt)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-3">
                <p className="text-slate-500 text-[11px]">ขั้นตอนปัจจุบัน</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{item.currentStep || '—'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-3">
                <p className="text-slate-500 text-[11px]">สถานะ</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{item.statusLabel}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 dark:border-white/[0.06] divide-y divide-slate-100 dark:divide-white/[0.04]">
              {item.detailFields.map((f) => (
                <div key={f.label} className="flex justify-between gap-4 px-4 py-2.5 text-[13px]">
                  <span className="text-slate-500 flex-shrink-0">{f.label}</span>
                  <span className="text-slate-900 dark:text-white text-right font-medium">{f.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-white/[0.06] px-5 py-4">
            <Link
              href={item.deepLink}
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-green-600 dark:text-green-400 hover:underline"
            >
              เปิดหน้ารายละเอียดเต็ม <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </>
      )}
    </MotionModal>
  )
}
