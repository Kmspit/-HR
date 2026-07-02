'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, XCircle, Archive, Clock, Bot, ChevronRight, Filter } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

export type WarningItem = {
  id: string
  level: number
  reason: string
  description: string | null
  isAuto: boolean
  month: number | null
  year: number | null
  status: string
  lateCount: number | null
  expiredAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  archivedAt: string | null
  rejectedReason: string | null
  approvalNote: string | null
  createdAt: string
  user: { id: string; name: string; department: string | null; position: string | null } | null
  issuedBy: { id: string; name: string } | null
  approvedBy: { id: string; name: string } | null
  rejectedBy: { id: string; name: string } | null
}

const STATUS_STYLE: Record<string, string> = {
  PENDING_APPROVAL: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  APPROVED:         'bg-green-500/20 text-green-400 border border-green-500/30',
  REJECTED:         'bg-red-500/20 text-red-400 border border-red-500/30',
  ARCHIVED:         'bg-slate-500/20 text-slate-400 border border-slate-500/30',
  DRAFT:            'bg-green-500/20 text-green-400 border border-green-500/30',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'รออนุมัติ',
  APPROVED:         'อนุมัติแล้ว',
  REJECTED:         'ปฏิเสธแล้ว',
  ARCHIVED:         'เก็บถาวร',
  DRAFT:            'ร่าง',
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  PENDING_APPROVAL: <Clock className="w-3 h-3" />,
  APPROVED:         <CheckCircle2 className="w-3 h-3" />,
  REJECTED:         <XCircle className="w-3 h-3" />,
  ARCHIVED:         <Archive className="w-3 h-3" />,
}

const LEVEL_COLOR = ['', 'text-yellow-400', 'text-orange-400', 'text-red-400']

const STATUS_FILTERS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'PENDING_APPROVAL', label: 'รออนุมัติ' },
  { value: 'APPROVED', label: 'อนุมัติแล้ว' },
  { value: 'REJECTED', label: 'ปฏิเสธแล้ว' },
  { value: 'ARCHIVED', label: 'เก็บถาวร' },
]

type Props = {
  initialWarnings: WarningItem[]
  canApprove: boolean
  isEmployee: boolean
}

export default function WarningList({ initialWarnings, canApprove, isEmployee }: Props) {
  const [warnings, setWarnings] = useState(initialWarnings)
  const [statusFilter, setStatusFilter] = useState('')
  const [acting, setActing] = useState<string | null>(null)
  const router = useRouter()

  const filtered = statusFilter
    ? warnings.filter((w) => w.status === statusFilter)
    : warnings

  const handleAction = async (
    id: string,
    action: 'APPROVE' | 'REJECT' | 'ARCHIVE',
    extra?: { note?: string; rejectedReason?: string },
  ) => {
    setActing(id)
    try {
      const { ok, data, status } = await apiJson(`/api/warnings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'ดำเนินการไม่สำเร็จ', status)); return }

      const label = action === 'APPROVE' ? 'อนุมัติแล้ว' : action === 'REJECT' ? 'ปฏิเสธแล้ว' : 'เก็บถาวรแล้ว'
      toast.success(label)
      setWarnings((prev) =>
        prev.map((w) => (w.id === id ? { ...w, ...(data as { warning: WarningItem }).warning } : w)),
      )
      router.refresh()
    } catch { toast.error('เกิดข้อผิดพลาด') }
    finally { setActing(null) }
  }

  const confirmReject = (id: string) => {
    const reason = prompt('ระบุเหตุผลที่ปฏิเสธ (ไม่บังคับ):') ?? ''
    handleAction(id, 'REJECT', { rejectedReason: reason })
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      {!isEmployee && (
        <div className="flex items-center gap-1 flex-wrap">
          <Filter className="w-4 h-4 text-slate-500 mr-1" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                statusFilter === f.value
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {f.label}
              {f.value === 'PENDING_APPROVAL' && (
                <span className="ml-1 text-amber-400">
                  ({warnings.filter((w) => w.status === 'PENDING_APPROVAL').length})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-white/5 bg-slate-900 py-12 text-center">
          <AlertTriangle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">ไม่มีใบเตือน</p>
        </div>
      )}

      {filtered.map((w) => (
        <div
          key={w.id}
          className={`rounded-2xl border bg-slate-900 p-4 space-y-3 ${
            w.status === 'PENDING_APPROVAL'
              ? 'border-amber-500/30'
              : w.status === 'APPROVED'
              ? 'border-green-500/20'
              : 'border-white/5'
          }`}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[w.status] ?? STATUS_STYLE.DRAFT}`}
              >
                {STATUS_ICON[w.status]}
                {STATUS_LABEL[w.status] ?? w.status}
              </span>

              <span className={`text-xs font-bold ${LEVEL_COLOR[w.level] ?? 'text-white'}`}>
                ระดับ {w.level}
              </span>

              {w.isAuto && (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300">
                  <Bot className="w-3 h-3" /> อัตโนมัติ
                </span>
              )}

              {w.lateCount != null && (
                <span className="text-[10px] text-slate-400">
                  (สาย {w.lateCount} ครั้ง เดือน {w.month}/{w.year})
                </span>
              )}
            </div>

            <button
              onClick={() => router.push(`/warnings/${w.id}`)}
              className="text-slate-500 hover:text-white transition-colors flex-shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Employee info (HR view) */}
          {!isEmployee && w.user && (
            <div className="text-xs text-slate-400">
              <span className="font-semibold text-white">{w.user.name}</span>
              {w.user.department && ` — ${w.user.department}`}
              {w.user.position && ` / ${w.user.position}`}
            </div>
          )}

          {/* Reason */}
          <p className="text-sm text-slate-200 leading-relaxed">{w.reason}</p>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span>ออกเมื่อ {new Date(w.createdAt).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</span>
            {w.approvedAt && w.approvedBy && (
              <span className="text-green-400">อนุมัติโดย {w.approvedBy.name}</span>
            )}
            {w.rejectedAt && w.rejectedBy && (
              <span className="text-red-400">ปฏิเสธโดย {w.rejectedBy.name}</span>
            )}
            {w.expiredAt && w.status === 'APPROVED' && (
              <span>หมดอายุ {new Date(w.expiredAt).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</span>
            )}
          </div>

          {w.rejectedReason && (
            <p className="text-xs text-red-300 bg-red-500/10 rounded-lg px-3 py-2">
              เหตุผลปฏิเสธ: {w.rejectedReason}
            </p>
          )}

          {/* Actions (approver only, PENDING_APPROVAL) */}
          {canApprove && w.status === 'PENDING_APPROVAL' && (
            <div className="flex gap-2 pt-1">
              <button
                disabled={acting === w.id}
                onClick={() => handleAction(w.id, 'APPROVE')}
                className="flex items-center gap-1.5 rounded-xl bg-green-600 hover:bg-green-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                อนุมัติ
              </button>
              <button
                disabled={acting === w.id}
                onClick={() => confirmReject(w.id)}
                className="flex items-center gap-1.5 rounded-xl bg-red-600/80 hover:bg-red-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                ปฏิเสธ
              </button>
            </div>
          )}

          {/* Archive (approver, APPROVED/REJECTED) */}
          {canApprove && ['APPROVED', 'REJECTED'].includes(w.status) && (
            <div className="flex pt-1">
              <button
                disabled={acting === w.id}
                onClick={() => handleAction(w.id, 'ARCHIVE')}
                className="flex items-center gap-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
              >
                <Archive className="w-3.5 h-3.5" />
                เก็บถาวร
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
