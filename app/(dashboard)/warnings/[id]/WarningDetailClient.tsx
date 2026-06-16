'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, CheckCircle2, XCircle, Archive,
  Clock, Bot, User, ArrowLeft, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

type WarningDetail = {
  id: string
  level: number
  reason: string
  description: string | null
  fileUrl: string | null
  isAuto: boolean
  month: number | null
  year: number | null
  lateCount: number | null
  status: string
  expiredAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  archivedAt: string | null
  rejectedReason: string | null
  approvalNote: string | null
  createdAt: string
  user: { id: string; name: string; employeeId: string | null; department: string | null; position: string | null } | null
  issuedBy: { id: string; name: string } | null
  approvedBy: { id: string; name: string } | null
  rejectedBy: { id: string; name: string } | null
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string; border: string }> = {
  PENDING_APPROVAL: {
    label: 'รออนุมัติ',
    icon: <Clock className="w-4 h-4" />,
    cls: 'text-amber-400 bg-amber-500/20',
    border: 'border-amber-500/30',
  },
  APPROVED: {
    label: 'อนุมัติแล้ว',
    icon: <CheckCircle2 className="w-4 h-4" />,
    cls: 'text-green-400 bg-green-500/20',
    border: 'border-green-500/20',
  },
  REJECTED: {
    label: 'ปฏิเสธแล้ว',
    icon: <XCircle className="w-4 h-4" />,
    cls: 'text-red-400 bg-red-500/20',
    border: 'border-red-500/20',
  },
  ARCHIVED: {
    label: 'เก็บถาวร',
    icon: <Archive className="w-4 h-4" />,
    cls: 'text-slate-400 bg-slate-500/20',
    border: 'border-slate-500/20',
  },
}

const LEVEL_COLOR = ['', 'text-yellow-400', 'text-orange-400', 'text-red-400']

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-3">
      <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider sm:w-32 flex-shrink-0 mt-0.5">{label}</span>
      <span className="text-sm text-slate-200">{value}</span>
    </div>
  )
}

export default function WarningDetailClient({
  warning,
  canApprove,
  isHR,
  currentUserId,
}: {
  warning: WarningDetail
  canApprove: boolean
  isHR: boolean
  currentUserId: string
}) {
  const [current, setCurrent] = useState(warning)
  const [acting, setActing] = useState(false)
  const [note, setNote] = useState('')
  const [rejectedReason, setRejectedReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const router = useRouter()

  const cfg = STATUS_CONFIG[current.status] ?? STATUS_CONFIG.APPROVED

  const doAction = async (action: 'APPROVE' | 'REJECT' | 'ARCHIVE') => {
    setActing(true)
    try {
      const body: Record<string, string> = { action }
      if (note) body.note = note
      if (action === 'REJECT' && rejectedReason) body.rejectedReason = rejectedReason

      const { ok, data, status } = await apiJson<{ warning: WarningDetail }>(`/api/warnings/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'ดำเนินการไม่สำเร็จ', status)); return }

      const labels = { APPROVE: 'อนุมัติแล้ว', REJECT: 'ปฏิเสธแล้ว', ARCHIVE: 'เก็บถาวรแล้ว' }
      toast.success(labels[action])
      setCurrent(data.warning)
      setNote('')
      setRejectedReason('')
      setShowRejectForm(false)
      router.refresh()
    } catch { toast.error('เกิดข้อผิดพลาด') }
    finally { setActing(false) }
  }

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
      : '—'

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        กลับ
      </button>

      {/* Status card */}
      <div className={`rounded-2xl border ${cfg.border} bg-slate-900 p-5 space-y-4`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${cfg.cls}`}>
            {cfg.icon}
            {cfg.label}
          </span>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${LEVEL_COLOR[current.level] ?? 'text-white'}`}>
              ระดับ {current.level}
            </span>
            {current.isAuto && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">
                <Bot className="w-3 h-3" /> อัตโนมัติ
              </span>
            )}
          </div>
        </div>

        {/* Employee info */}
        {current.user && (
          <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-slate-800/50 p-3">
            <User className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white">{current.user.name}</p>
              {current.user.employeeId && <p className="text-xs text-slate-400">{current.user.employeeId}</p>}
              {current.user.department && (
                <p className="text-xs text-slate-400">
                  {current.user.department}{current.user.position ? ` / ${current.user.position}` : ''}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Details */}
        <div className="space-y-2.5">
          <InfoRow label="เหตุผล" value={current.reason} />
          {current.description && <InfoRow label="รายละเอียด" value={current.description} />}
          {current.lateCount != null && (
            <InfoRow label="มาสาย" value={`${current.lateCount} ครั้ง (เดือน ${current.month}/${current.year})`} />
          )}
          <InfoRow label="ออกเมื่อ" value={fmtDate(current.createdAt)} />
          {current.expiredAt && current.status === 'APPROVED' && (
            <InfoRow label="หมดอายุ" value={fmtDate(current.expiredAt)} />
          )}
          {current.issuedBy && <InfoRow label="ออกโดย" value={current.issuedBy.name} />}
          {current.approvedBy && (
            <InfoRow label="อนุมัติโดย" value={`${current.approvedBy.name} · ${fmtDate(current.approvedAt)}`} />
          )}
          {current.rejectedBy && (
            <InfoRow
              label="ปฏิเสธโดย"
              value={`${current.rejectedBy.name} · ${fmtDate(current.rejectedAt)}`}
            />
          )}
          {current.rejectedReason && (
            <InfoRow label="เหตุผลปฏิเสธ" value={
              <span className="text-red-300">{current.rejectedReason}</span>
            } />
          )}
          {current.approvalNote && <InfoRow label="หมายเหตุ" value={current.approvalNote} />}
          {current.archivedAt && <InfoRow label="เก็บถาวร" value={fmtDate(current.archivedAt)} />}
        </div>
      </div>

      {/* Approval actions */}
      {canApprove && current.status === 'PENDING_APPROVAL' && (
        <div className="rounded-2xl border border-amber-500/20 bg-slate-900 p-5 space-y-4">
          <p className="text-sm font-semibold text-amber-400">รออนุมัติจากคุณ</p>

          <div>
            <label className="text-xs text-slate-500 font-semibold">หมายเหตุ (ไม่บังคับ)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 resize-none"
              placeholder="ระบุหมายเหตุเพิ่มเติม..."
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              disabled={acting}
              onClick={() => doAction('APPROVE')}
              className="flex items-center gap-2 rounded-xl bg-green-600 hover:bg-green-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              อนุมัติ
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => setShowRejectForm((v) => !v)}
              className="flex items-center gap-2 rounded-xl bg-red-600/70 hover:bg-red-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              ปฏิเสธ
            </button>
          </div>

          {showRejectForm && (
            <div className="space-y-2 border-t border-white/5 pt-4">
              <label className="text-xs text-slate-400">เหตุผลที่ปฏิเสธ (ไม่บังคับ)</label>
              <input
                value={rejectedReason}
                onChange={(e) => setRejectedReason(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-red-500/50"
                placeholder="ระบุเหตุผล..."
              />
              <button
                type="button"
                disabled={acting}
                onClick={() => doAction('REJECT')}
                className="flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                ยืนยันปฏิเสธ
              </button>
            </div>
          )}
        </div>
      )}

      {/* Archive action */}
      {(isHR || canApprove) && ['APPROVED', 'REJECTED'].includes(current.status) && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={acting}
            onClick={() => doAction('ARCHIVE')}
            className="flex items-center gap-2 rounded-xl bg-slate-700 hover:bg-slate-600 px-4 py-2 text-xs text-slate-300 disabled:opacity-50"
          >
            <Archive className="w-3.5 h-3.5" />
            เก็บถาวร
          </button>
        </div>
      )}

      {/* Employee view info */}
      {!canApprove && !isHR && current.status === 'APPROVED' && (
        <div className="rounded-xl border border-white/5 bg-slate-900 px-4 py-3 text-xs text-slate-400">
          ใบเตือนนี้จะหมดอายุใน{' '}
          {current.expiredAt
            ? new Date(current.expiredAt).toLocaleDateString('th-TH', { dateStyle: 'medium' })
            : '12 เดือน'}
        </div>
      )}
    </div>
  )
}
