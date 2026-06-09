'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Clock, ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, FileText, AlertCircle } from 'lucide-react'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { bangkokDateKey, formatTimeBangkok, formatDateBangkok } from '@/lib/datetime-bangkok'

// ─── Types ────────────────────────────────────────────────────────────────────

const SCAN_TYPES = ['checkin', 'lunch-out', 'lunch-in', 'checkout'] as const
type ScanType = (typeof SCAN_TYPES)[number]

const SCAN_LABEL: Record<ScanType, string> = {
  checkin:     'ลืมเข้างาน',
  'lunch-out': 'ลืมพักเที่ยงออก',
  'lunch-in':  'ลืมพักเที่ยงเข้า',
  checkout:    'ลืมออกงาน',
}

const SCAN_ICON: Record<ScanType, string> = {
  checkin:     '🟢',
  'lunch-out': '🍱',
  'lunch-in':  '🔔',
  checkout:    '🔵',
}

type ForgotScanRequest = {
  id: string
  userId: string
  date: string
  scanType: ScanType
  correctTime: string
  reason: string
  evidenceUrl: string | null
  status: 'PENDING' | 'ADMIN_APPROVED' | 'APPROVED' | 'REJECTED' | 'ADMIN_REJECTED'
  supervisorId: string | null
  supervisorNote: string | null
  supervisorAt: string | null
  hrId: string | null
  hrNote: string | null
  hrAt: string | null
  originalTime: string | null
  attendanceId: string | null
  appliedAt: string | null
  createdAt: string
  user: { id: string; name: string; employeeId: string | null; department: string | null }
  supervisorRel: { name: string } | null
  hrRel: { name: string } | null
}

type Props = {
  userId: string
  userName: string
  role: string
  isSupervisor: boolean
  isHR: boolean
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  PENDING:        { label: 'รอหัวหน้าอนุมัติ', color: 'text-yellow-400',   bg: 'rgba(234,179,8,0.12)',    border: 'rgba(234,179,8,0.3)'    },
  ADMIN_APPROVED: { label: 'รอ HR อนุมัติ',    color: 'text-blue-400',     bg: 'rgba(59,130,246,0.12)',   border: 'rgba(59,130,246,0.3)'   },
  APPROVED:       { label: 'อนุมัติแล้ว',       color: 'text-green-400',    bg: 'rgba(34,197,94,0.12)',    border: 'rgba(34,197,94,0.3)'    },
  REJECTED:       { label: 'ปฏิเสธ (หัวหน้า)', color: 'text-red-400',      bg: 'rgba(239,68,68,0.12)',    border: 'rgba(239,68,68,0.3)'    },
  ADMIN_REJECTED: { label: 'ปฏิเสธ (HR)',       color: 'text-red-400',      bg: 'rgba(239,68,68,0.12)',    border: 'rgba(239,68,68,0.3)'    },
} as const

function StatusBadge({ status }: { status: ForgotScanRequest['status'] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.color}`}
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  )
}

// ─── Request card ─────────────────────────────────────────────────────────────

function RequestCard({
  req,
  canAct,
  onAction,
}: {
  req: ForgotScanRequest
  canAct: boolean
  onAction: (id: string, action: 'APPROVE' | 'REJECT', note: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState('')
  const [isPending, startTransition] = useTransition()

  const handle = (action: 'APPROVE' | 'REJECT') => {
    startTransition(async () => {
      await onAction(req.id, action, note)
      setNote('')
    })
  }

  const canApprove =
    canAct &&
    (req.status === 'PENDING' || req.status === 'ADMIN_APPROVED') &&
    !['APPROVED', 'REJECTED', 'ADMIN_REJECTED'].includes(req.status)

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Card header */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-xl mt-0.5 flex-shrink-0">{SCAN_ICON[req.scanType]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{SCAN_LABEL[req.scanType]}</span>
            <StatusBadge status={req.status} />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {req.user.name}
            {req.user.employeeId ? ` (${req.user.employeeId})` : ''}
            {req.user.department ? ` · ${req.user.department}` : ''}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            วันที่: <span className="text-slate-300">{formatDateBangkok(req.date)}</span>
            {' · '}เวลาขอแก้เป็น: <span className="text-white font-medium">{formatTimeBangkok(req.correctTime)}</span>
          </p>
        </div>
        <span className="text-slate-500 flex-shrink-0 mt-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {/* Reason */}
          <div className="pt-3">
            <p className="text-[11px] text-slate-500 mb-1">เหตุผล</p>
            <p className="text-sm text-slate-300">{req.reason}</p>
          </div>

          {/* Evidence */}
          {req.evidenceUrl && (
            <div>
              <p className="text-[11px] text-slate-500 mb-1">หลักฐาน</p>
              <a
                href={req.evidenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:underline"
              >
                <FileText className="w-3.5 h-3.5" />
                ดูไฟล์หลักฐาน
              </a>
            </div>
          )}

          {/* Approval trail */}
          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-500">ประวัติการอนุมัติ</p>
            <div className="flex gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                {req.supervisorAt ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span className={req.supervisorAt ? 'text-green-400' : 'text-slate-500'}>
                  หัวหน้า{req.supervisorRel ? `: ${req.supervisorRel.name}` : ''}
                  {req.supervisorAt ? ` (${formatTimeBangkok(req.supervisorAt)})` : ' — รอ'}
                </span>
              </div>
            </div>
            <div className="flex gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                {req.hrAt ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span className={req.hrAt ? 'text-green-400' : 'text-slate-500'}>
                  HR{req.hrRel ? `: ${req.hrRel.name}` : ''}
                  {req.hrAt ? ` (${formatTimeBangkok(req.hrAt)})` : ' — รอ'}
                </span>
              </div>
            </div>
            {req.supervisorNote && (
              <p className="text-xs text-yellow-400/80">หมายเหตุหัวหน้า: {req.supervisorNote}</p>
            )}
            {req.hrNote && (
              <p className="text-xs text-blue-400/80">หมายเหตุ HR: {req.hrNote}</p>
            )}
          </div>

          {/* Applied info */}
          {req.appliedAt && (
            <div className="rounded-lg px-3 py-2 text-xs"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <span className="text-green-400">ระบบอัปเดตเรียบร้อย</span>
              {req.originalTime && (
                <span className="text-slate-400 ml-2">
                  (เดิม: {formatTimeBangkok(req.originalTime)} → {formatTimeBangkok(req.correctTime)})
                </span>
              )}
            </div>
          )}

          {/* Action buttons (only shown to eligible approvers) */}
          {canApprove && (
            <div className="space-y-2 pt-1">
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="หมายเหตุ (ไม่บังคับ)..."
                className="w-full rounded-lg px-3 py-2 text-sm bg-white/5 border border-white/10 text-white placeholder:text-slate-600 resize-none focus:outline-none focus:border-blue-500/50"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handle('APPROVE')}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-green-300 transition-all disabled:opacity-50"
                  style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
                >
                  {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  อนุมัติ
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handle('REJECT')}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-red-300 transition-all disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  ปฏิเสธ
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ForgotScanClient({ userId, userName, isSupervisor, isHR }: Props) {
  const canApproveAnything = isSupervisor || isHR

  const [tab, setTab] = useState<'mine' | 'pending'>('mine')
  const [showForm, setShowForm] = useState(false)
  const [requests, setRequests] = useState<ForgotScanRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  // Form state
  const [date, setDate] = useState(bangkokDateKey())
  const [scanType, setScanType] = useState<ScanType>('checkin')
  const [correctTime, setCorrectTime] = useState('08:30')
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState<File | null>(null)

  const fetchRequests = useCallback(async (t: 'mine' | 'pending') => {
    setLoading(true)
    try {
      const { ok, data } = await apiJson<{ requests: ForgotScanRequest[] }>(
        `/api/forgot-scan?tab=${t}`,
      )
      if (ok) setRequests(data.requests ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchRequests(tab)
  }, [tab, fetchRequests])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) { toast.error('กรุณาระบุเหตุผล'); return }

    startTransition(async () => {
      const form = new FormData()
      form.set('date', date)
      form.set('scanType', scanType)
      form.set('correctTime', correctTime)
      form.set('reason', reason.trim())
      if (evidence) form.set('evidence', evidence)

      const { ok, data, status } = await apiJson<{ success?: boolean; error?: string }>(
        '/api/forgot-scan',
        { method: 'POST', body: form },
      )
      if (!ok) {
        toast.error(apiErrorMessage(data as Record<string, unknown>, 'ส่งคำขอไม่สำเร็จ', status))
        return
      }
      toast.success('ส่งคำขอแก้ไขเวลาเรียบร้อย')
      setShowForm(false)
      setReason('')
      setEvidence(null)
      await fetchRequests('mine')
      setTab('mine')
    })
  }

  const handleAction = async (id: string, action: 'APPROVE' | 'REJECT', note: string) => {
    const { ok, data, status } = await apiJson<{ success?: boolean; error?: string }>(
      `/api/forgot-scan/${id}/approve`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note: note || undefined }) },
    )
    if (!ok) {
      toast.error(apiErrorMessage(data as Record<string, unknown>, 'ดำเนินการไม่สำเร็จ', status))
      return
    }
    toast.success(action === 'APPROVE' ? 'อนุมัติเรียบร้อย' : 'ปฏิเสธเรียบร้อย')
    await fetchRequests(tab)
  }

  // Decide if current user can act on a specific request
  const canActOn = (req: ForgotScanRequest): boolean => {
    if (req.userId === userId && !isSupervisor && !isHR) return false // own requests — no
    if (req.status === 'PENDING' && isSupervisor) return true
    if (req.status === 'ADMIN_APPROVED' && isHR) return true
    return false
  }

  const pendingCount = requests.filter(
    (r) => (r.status === 'PENDING' && isSupervisor) || (r.status === 'ADMIN_APPROVED' && isHR),
  ).length

  return (
    <div className="p-4 md:p-5 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">แก้ไขเวลาลงงาน</h1>
          <p className="text-xs text-slate-500 mt-0.5">ยื่นคำขอกรณีลืมสแกนเวลา</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((p) => !p)}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.97]"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
        >
          {showForm ? 'ยกเลิก' : '+ ยื่นคำขอ'}
        </button>
      </div>

      {/* Submit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-4 space-y-4"
          style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(59,130,246,0.25)' }}
        >
          <p className="text-sm font-semibold text-blue-400">แบบฟอร์มขอแก้ไขเวลา</p>

          <div className="grid grid-cols-2 gap-3">
            {/* Date */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-slate-400 mb-1">วันที่ลืมสแกน</label>
              <input
                type="date"
                required
                value={date}
                max={bangkokDateKey()}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>

            {/* Correct time */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-slate-400 mb-1">เวลาที่ถูกต้อง</label>
              <input
                type="time"
                required
                value={correctTime}
                onChange={(e) => setCorrectTime(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>

          {/* Scan type */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">ประเภทที่ลืมสแกน</label>
            <div className="grid grid-cols-2 gap-2">
              {SCAN_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setScanType(t)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
                  style={{
                    background: scanType === t ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${scanType === t ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    color: scanType === t ? '#93c5fd' : '#94a3b8',
                  }}
                >
                  <span>{SCAN_ICON[t]}</span>
                  <span>{SCAN_LABEL[t]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">เหตุผล <span className="text-red-400">*</span></label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="อธิบายสาเหตุที่ลืมสแกน..."
              className="w-full rounded-lg px-3 py-2 text-sm bg-white/5 border border-white/10 text-white placeholder:text-slate-600 resize-none focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {/* Evidence */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">แนบหลักฐาน (ไม่บังคับ)</label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setEvidence(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-500/15 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-300 hover:file:bg-blue-500/25"
            />
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
            style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}>
            <AlertCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <span className="text-yellow-400/80">
              คำขอต้องผ่านการอนุมัติจากหัวหน้างาน → HR ก่อนระบบจะอัปเดตเวลาลงเวลางาน
            </span>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-all disabled:opacity-50 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            ส่งคำขอ
          </button>
        </form>
      )}

      {/* Tabs */}
      {canApproveAnything && (
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
          {[
            { id: 'mine',    label: 'คำขอของฉัน' },
            { id: 'pending', label: `รออนุมัติ${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as 'mine' | 'pending')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
                tab === t.id ? 'bg-blue-600 text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Request list */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl py-12 text-center"
          style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Clock className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            {tab === 'pending' ? 'ไม่มีคำขอที่รอการอนุมัติ' : 'ยังไม่มีคำขอแก้ไขเวลา'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              canAct={canActOn(req)}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      {/* Approval flow legend */}
      <div className="rounded-xl px-4 py-3 space-y-1.5"
        style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-[11px] text-slate-500 font-medium">ขั้นตอนการอนุมัติ</p>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="text-blue-300">พนักงาน</span>
          <span className="text-slate-600">→</span>
          <span className="text-yellow-300">หัวหน้างาน</span>
          <span className="text-slate-600">→</span>
          <span className="text-green-300">HR</span>
          <span className="text-slate-600">→</span>
          <span className="text-white">อัปเดตเวลาอัตโนมัติ</span>
        </div>
      </div>
    </div>
  )
}
