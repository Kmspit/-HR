'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatThaiDate } from '@/lib/utils'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { LEAVE_TYPE_LABELS } from '@/lib/leave-types'
import { weeklyDayLabel } from '@/lib/weekly-plan-days'

type Person = { name: string; email: string; department: string | null; position?: string | null; role: string }
type LR = { id: string; type: string; startDate: string; endDate: string; days: number; reason: string; status: string; user: Person }
type OR = { id: string; date: string; startTime: string; endTime: string; place: string; purpose: string; status: string; user: Person }
type WP = { id: string; weekStart: string; weekEnd: string; status: string; isLate: boolean; note?: string | null; lawyer: { name: string; email: string }; days: { dayOfWeek: number; place: string; purpose: string }[] }

type Props = {
  leaveRequests: LR[]
  outsideRequests: OR[]
  weeklyPlans: WP[]
  userRole: string
}

const LEAVE_TYPES = LEAVE_TYPE_LABELS

function personSubtitle(u: Person) {
  const pos = u.position?.trim() || '—'
  const dept = u.department?.trim() || '—'
  return `${pos} · ${dept}`
}

function ApprovalActions({
  requestId,
  type,
  loading,
  rejectingId,
  reason,
  setRejectingId,
  setReason,
  onAction,
}: {
  requestId: string
  type: 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN'
  loading: string | null
  rejectingId: string | null
  reason: string
  setRejectingId: (id: string | null) => void
  setReason: (v: string) => void
  onAction: (type: 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN', requestId: string, action: 'APPROVE' | 'REJECT') => void
}) {
  const busy = loading === requestId
  const isRejecting = rejectingId === requestId
  const blocked = loading !== null && !busy

  if (isRejecting) {
    return (
      <div className="mt-3 space-y-2">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ระบุเหตุผลการปฏิเสธ..."
          rows={2}
          className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-red-500/50 resize-none"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onAction(type, requestId, 'REJECT')}
            disabled={busy || !reason.trim()}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50 touch-manipulation"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
            ยืนยันปฏิเสธ
          </button>
          <button
            type="button"
            onClick={() => { setRejectingId(null); setReason('') }}
            className="min-h-[44px] rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white touch-manipulation"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        onClick={() => onAction(type, requestId, 'APPROVE')}
        disabled={blocked || busy}
        className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-500 active:scale-[0.98] disabled:opacity-50 touch-manipulation"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
        อนุมัติ
      </button>
      <button
        type="button"
        onClick={() => setRejectingId(requestId)}
        disabled={blocked}
        className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-50 touch-manipulation"
      >
        <XCircle size={16} />
        ปฏิเสธ
      </button>
    </div>
  )
}

function PersonHeader({ name, subtitle, badge, accent = 'blue' }: { name: string; subtitle: string; badge: string; accent?: 'blue' | 'purple' }) {
  const accentCls = accent === 'purple' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-lg font-bold ${accentCls}`}>
          {name[0] ?? '?'}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-white leading-tight">{name}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>
        </div>
      </div>
      <span className="flex-shrink-0 rounded-lg bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold text-yellow-400">{badge}</span>
    </div>
  )
}

export default function ApprovalPanel({ leaveRequests, outsideRequests, weeklyPlans, userRole }: Props) {
  const [tab, setTab] = useState<'leave' | 'outside' | 'weekly'>('leave')
  const [loading, setLoading] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const router = useRouter()

  const handleAction = async (type: 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN', requestId: string, action: 'APPROVE' | 'REJECT') => {
    if (action === 'REJECT' && rejectingId !== requestId) {
      setRejectingId(requestId)
      return
    }
    setLoading(requestId)
    try {
      const { ok, data, status } = await apiJson('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, requestId, action, reason: action === 'REJECT' ? reason : undefined }),
      })
      if (!ok) {
        toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
        return
      }
      toast.success(action === 'APPROVE' ? '✅ อนุมัติเรียบร้อย' : '❌ ปฏิเสธเรียบร้อย')
      setRejectingId(null)
      setReason('')
      router.refresh()
    } catch (err) {
      console.error('[approval]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(null)
    }
  }

  const actionProps = { loading, rejectingId, reason, setRejectingId, setReason, onAction: handleAction }

  const tabs = [
    { id: 'leave' as const, label: `📅 คำขอลา`, count: leaveRequests.length },
    { id: 'outside' as const, label: `🚗 นอกสถานที่`, count: outsideRequests.length },
    ...(weeklyPlans.length > 0 || userRole === 'MANAGER_HR'
      ? [{ id: 'weekly' as const, label: `📋 แผนทนาย`, count: weeklyPlans.length }]
      : []),
  ]

  const stepLabel = userRole === 'ADMIN'
    ? 'Admin กำลังตรวจสอบ (Step 1)'
    : 'Manager / HR Final Approval (Step 2)'

  return (
    <div className="p-4 md:p-5 space-y-5 max-w-full">
      <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${userRole === 'ADMIN' ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : 'border-purple-500/30 bg-purple-500/10 text-purple-400'}`}>
        {userRole === 'ADMIN' ? '1️⃣' : '2️⃣'} {stepLabel}
      </div>

      <div className="flex gap-1 rounded-xl bg-slate-900 p-1 border border-white/5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setRejectingId(null); setReason('') }}
            className={`flex flex-1 min-w-[88px] items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all touch-manipulation ${tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === t.id ? 'bg-white/20' : 'bg-slate-700'}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'leave' && (
        <div className="space-y-3">
          {leaveRequests.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 p-8 text-center text-slate-500">ไม่มีคำขอลาที่รอดำเนินการ ✅</div>
          ) : leaveRequests.map((l) => (
            <div key={l.id} className="rounded-2xl border border-white/5 bg-slate-900 p-4">
              <PersonHeader name={l.user.name} subtitle={personSubtitle(l.user)} badge="รออนุมัติ" />
              <ApprovalActions requestId={l.id} type="LEAVE" {...actionProps} />
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-white/5 p-2.5"><p className="text-slate-500">ประเภท</p><p className="font-semibold text-white">{LEAVE_TYPES[l.type] ?? l.type}</p></div>
                <div className="rounded-lg bg-white/5 p-2.5"><p className="text-slate-500">ช่วงเวลา</p><p className="font-semibold text-white">{formatThaiDate(l.startDate)} — {formatThaiDate(l.endDate)}</p></div>
                <div className="rounded-lg bg-white/5 p-2.5"><p className="text-slate-500">จำนวน</p><p className="font-semibold text-white">{l.days} วัน</p></div>
              </div>
              {l.reason && <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-300">📝 {l.reason}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'outside' && (
        <div className="space-y-3">
          {outsideRequests.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 p-8 text-center text-slate-500">ไม่มีคำขอออกนอกสถานที่ ✅</div>
          ) : outsideRequests.map((o) => (
            <div key={o.id} className="rounded-2xl border border-white/5 bg-slate-900 p-4">
              <PersonHeader name={o.user.name} subtitle={personSubtitle(o.user)} badge="รออนุมัติ" accent="purple" />
              <ApprovalActions requestId={o.id} type="OUTSIDE" {...actionProps} />
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white/5 p-2.5"><p className="text-slate-500">วันที่</p><p className="font-semibold text-white">{formatThaiDate(o.date)}</p></div>
                <div className="rounded-lg bg-white/5 p-2.5"><p className="text-slate-500">เวลา</p><p className="font-semibold text-white">{o.startTime} — {o.endTime}</p></div>
                <div className="sm:col-span-2 rounded-lg bg-white/5 p-2.5"><p className="text-slate-500">สถานที่</p><p className="font-semibold text-white">{o.place}</p></div>
                <div className="sm:col-span-2 rounded-lg bg-white/5 p-2.5"><p className="text-slate-500">วัตถุประสงค์</p><p className="font-semibold text-white">{o.purpose}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'weekly' && (
        <div className="space-y-3">
          {weeklyPlans.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 p-8 text-center text-slate-500">ไม่มีแผนงานทนายที่รออนุมัติ ✅</div>
          ) : weeklyPlans.map((p) => (
            <div key={p.id} className="rounded-2xl border border-white/5 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{p.lawyer.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">ทนายความ · {formatThaiDate(p.weekStart)} — {formatThaiDate(p.weekEnd)}</p>
                </div>
                {p.isLate && <span className="rounded-lg bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">⚠️ ส่งช้า</span>}
              </div>
              <ApprovalActions requestId={p.id} type="WEEKLY_PLAN" {...actionProps} />
              <div className="mt-3 space-y-1.5">
                {p.days.length === 0 ? (
                  <p className="text-xs text-slate-500 rounded-lg bg-white/5 px-2.5 py-2">
                    ไม่มีวันออกนอกสถานที่{p.note ? ` · ${p.note}` : ''}
                  </p>
                ) : (
                  p.days.map((d) => (
                    <div key={d.dayOfWeek} className="flex items-start gap-2 rounded-lg bg-white/5 px-2.5 py-2 text-xs">
                      <span className="font-semibold text-blue-400 w-14 flex-shrink-0">วัน{weeklyDayLabel(d.dayOfWeek)}</span>
                      <span className="text-slate-300">{d.place} — {d.purpose}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
