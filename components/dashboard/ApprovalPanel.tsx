'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, CheckCircle, XCircle, CalendarCheck, MapPin, FileText, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatThaiDate } from '@/lib/utils'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { LEAVE_TYPE_LABELS } from '@/lib/leave-types'
import { weeklyDayLabel } from '@/lib/weekly-plan-days'

type Person = { name: string; email: string; department: string | null; position?: string | null; role: string }
type LR = { id: string; type: string; startDate: string; endDate: string; days: number; reason: string; status: string; stepName?: string | null; user: Person }
type OR = { id: string; date: string; startTime: string; endTime: string; place: string; purpose: string; status: string; stepName?: string | null; user: Person; googleMapsUrl?: string | null; attachmentUrl?: string | null; attachmentName?: string | null; approvalStatus?: string | null }
type WP = { id: string; weekStart: string; weekEnd: string; status: string; isLate: boolean; note?: string | null; stepName?: string | null; lawyer: { name: string; email: string }; days: { dayOfWeek: number; place: string | null; purpose: string | null }[] }
type FS = { id: string; date: string; scanType: string; correctTime: string; reason: string; status: string; stepName?: string | null; user: Person }

const SCAN_TYPE_LABELS: Record<string, string> = {
  checkin: 'เข้างาน',
  'lunch-out': 'พักกลางวันออก',
  'lunch-in': 'กลับจากพัก',
  checkout: 'ออกงาน',
}

type Props = {
  leaveRequests: LR[]
  outsideRequests: OR[]
  weeklyPlans: WP[]
  forgotScanRequests: FS[]
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
  type: 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN' | 'FORGOT_SCAN'
  loading: string | null
  rejectingId: string | null
  reason: string
  setRejectingId: (id: string | null) => void
  setReason: (v: string) => void
  onAction: (type: 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN' | 'FORGOT_SCAN', requestId: string, action: 'APPROVE' | 'REJECT') => void
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
          className="w-full rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2.5 text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-red-500 dark:focus:border-red-500/50 resize-none"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onAction(type, requestId, 'REJECT')}
            disabled={busy || !reason.trim()}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-[14px] font-semibold text-white hover:bg-red-500 disabled:opacity-50 touch-manipulation"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
            ยืนยันปฏิเสธ
          </button>
          <button
            type="button"
            onClick={() => { setRejectingId(null); setReason('') }}
            className="min-h-[44px] rounded-xl border border-slate-300 dark:border-white/10 px-4 py-2 text-[14px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5 touch-manipulation"
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
        className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2.5 text-[14px] font-semibold text-white hover:bg-green-500 active:scale-[0.98] disabled:opacity-50 touch-manipulation"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
        อนุมัติ
      </button>
      <button
        type="button"
        onClick={() => setRejectingId(requestId)}
        disabled={blocked}
        className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 py-2.5 text-[14px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-50 touch-manipulation"
      >
        <XCircle size={16} />
        ปฏิเสธ
      </button>
    </div>
  )
}

function PersonHeader({ name, subtitle, badge, accent = 'blue' }: { name: string; subtitle: string; badge: string; accent?: 'blue' | 'purple' }) {
  const accentCls = accent === 'purple'
    ? 'bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400'
    : 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-lg font-bold ${accentCls}`}>
          {name[0] ?? '?'}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-[15px] text-slate-900 dark:text-white leading-tight">{name}</p>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{subtitle}</p>
        </div>
      </div>
      <span className="flex-shrink-0 rounded-lg bg-amber-100 dark:bg-yellow-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:text-yellow-400">{badge}</span>
    </div>
  )
}

export default function ApprovalPanel({ leaveRequests, outsideRequests, weeklyPlans, forgotScanRequests, userRole }: Props) {
  const [tab, setTab] = useState<'leave' | 'outside' | 'weekly' | 'forgot'>('leave')
  const [loading, setLoading] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const router = useRouter()

  const handleAction = async (type: 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN' | 'FORGOT_SCAN', requestId: string, action: 'APPROVE' | 'REJECT') => {
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
    ...(weeklyPlans.length > 0 || userRole === 'MANAGER_HR' || userRole === 'ADMIN' || userRole === 'CEO'
      ? [{ id: 'weekly' as const, label: `📋 แผนทนาย`, count: weeklyPlans.length }]
      : []),
    ...(forgotScanRequests.length > 0 || ['HR', 'MANAGER_HR', 'MANAGER', 'TEAM_LEADER', 'ADMIN', 'CEO', 'SUPER_ADMIN'].includes(userRole)
      ? [{ id: 'forgot' as const, label: `🔍 แก้เวลา`, count: forgotScanRequests.length }]
      : []),
  ]

  const stepLabel = userRole === 'TEAM_LEADER' || userRole === 'MANAGER'
    ? 'หัวหน้า — อนุมัติเฉพาะลูกทีมของคุณ'
    : userRole === 'CEO'
    ? 'ผู้บริหาร (CEO) — อนุมัติทุกขั้นตอน'
    : 'HR / Admin — อนุมัติตามขั้นตอนที่กำหนด'

  return (
    <div className="p-5 md:p-6 space-y-5 max-w-full">
      <div className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold ${userRole === 'CEO' ? 'border-amber-300 dark:border-yellow-500/30 bg-amber-50 dark:bg-yellow-500/10 text-amber-700 dark:text-yellow-400' : userRole === 'ADMIN' ? 'border-blue-300 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' : 'border-purple-300 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400'}`}>
        {userRole === 'CEO' ? '👑' : userRole === 'ADMIN' ? '1️⃣' : '2️⃣'} {stepLabel}
      </div>

      <div className="flex gap-1 rounded-xl bg-slate-100 dark:bg-slate-900 p-1 border border-slate-200 dark:border-white/5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setRejectingId(null); setReason('') }}
            className={`flex flex-1 min-w-[88px] items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition-all touch-manipulation ${tab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${tab === t.id ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'leave' && (
        <div className="space-y-3">
          {leaveRequests.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 py-14 text-center space-y-3">
              <CalendarCheck className="w-12 h-12 mx-auto text-emerald-500/50" />
              <p className="font-semibold text-white text-[15px]">ไม่มีคำขอลาค้างอยู่</p>
              <p className="text-[13px] text-slate-500">ทุกคำขอลาได้รับการดำเนินการแล้ว</p>
            </div>
          ) : leaveRequests.map((l) => (
            <div key={l.id} className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900 shadow-sm p-5">
              <PersonHeader name={l.user.name} subtitle={personSubtitle(l.user)} badge={l.stepName ? `ขั้น: ${l.stepName}` : 'รออนุมัติ'} />
              <ApprovalActions requestId={l.id} type="LEAVE" {...actionProps} />
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[13px]">
                <div className="rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-transparent p-3">
                  <p className="text-slate-500 text-[12px]">ประเภท</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{LEAVE_TYPES[l.type] ?? l.type}</p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-transparent p-3">
                  <p className="text-slate-500 text-[12px]">ช่วงเวลา</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{formatThaiDate(l.startDate)} — {formatThaiDate(l.endDate)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-transparent p-3">
                  <p className="text-slate-500 text-[12px]">จำนวน</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{l.days} วัน</p>
                </div>
              </div>
              {l.reason && <p className="mt-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-transparent px-3 py-2.5 text-[13px] text-slate-700 dark:text-slate-300">📝 {l.reason}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'outside' && (
        <div className="space-y-3">
          {outsideRequests.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 py-14 text-center space-y-3">
              <MapPin className="w-12 h-12 mx-auto text-purple-500/50" />
              <p className="font-semibold text-white text-[15px]">ไม่มีคำขอออกนอกสถานที่</p>
              <p className="text-[13px] text-slate-500">ทุกคำขอได้รับการดำเนินการแล้ว</p>
            </div>
          ) : outsideRequests.map((o) => (
            <div key={o.id} className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900 shadow-sm p-5">
              <PersonHeader name={o.user.name} subtitle={personSubtitle(o.user)} badge={o.stepName ? `ขั้น: ${o.stepName}` : 'รออนุมัติ'} accent="purple" />
              <ApprovalActions requestId={o.id} type="OUTSIDE" {...actionProps} />
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[13px]">
                <div className="rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-transparent p-3">
                  <p className="text-slate-500 text-[12px]">วันที่</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{formatThaiDate(o.date)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-transparent p-3">
                  <p className="text-slate-500 text-[12px]">เวลา</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{o.startTime} — {o.endTime}</p>
                </div>
                <div className="sm:col-span-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-transparent p-3">
                  <p className="text-slate-500 text-[12px]">สถานที่</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{o.place}</p>
                </div>
                <div className="sm:col-span-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-transparent p-3">
                  <p className="text-slate-500 text-[12px]">วัตถุประสงค์</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{o.purpose}</p>
                </div>
                {o.googleMapsUrl && (
                  <div className="sm:col-span-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-transparent p-3">
                    <p className="text-slate-500 text-[12px]">Google Maps</p>
                    <a href={o.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-500 underline break-all text-[13px]">{o.googleMapsUrl}</a>
                  </div>
                )}
                {o.attachmentUrl && (
                  <div className="sm:col-span-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-transparent p-3">
                    <p className="text-slate-500 text-[12px]">เอกสารแนบ</p>
                    <a href={o.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-500 underline text-[13px]">{o.attachmentName || 'ดูเอกสาร'}</a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'weekly' && (
        <div className="space-y-3">
          <div className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold ${userRole === 'MANAGER_HR' ? 'border-amber-300 dark:border-yellow-500/30 bg-amber-50 dark:bg-yellow-500/10 text-amber-700 dark:text-yellow-400' : userRole === 'CEO' ? 'border-amber-300 dark:border-yellow-500/30 bg-amber-50 dark:bg-yellow-500/10 text-amber-700 dark:text-yellow-400' : 'border-green-300 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400'}`}>
            {userRole === 'MANAGER_HR' ? '1️⃣ หัวหน้างาน — รออนุมัติเบื้องต้น' : userRole === 'CEO' ? '👑 ผู้บริหาร (CEO) — อนุมัติทุกขั้นตอน' : '2️⃣ ผู้บริหาร — อนุมัติขั้นสุดท้าย'}
          </div>
          {weeklyPlans.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 py-14 text-center space-y-3">
              <FileText className="w-12 h-12 mx-auto text-amber-500/50" />
              <p className="font-semibold text-white text-[15px]">ไม่มีแผนงานทนายรออนุมัติ</p>
              <p className="text-[13px] text-slate-500">ทุกแผนงานได้รับการดำเนินการแล้ว</p>
            </div>
          ) : weeklyPlans.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[15px] text-slate-900 dark:text-white">{p.lawyer.name}</p>
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
                    ทนายความ · {formatThaiDate(p.weekStart)} — {formatThaiDate(p.weekEnd)}
                    {p.stepName ? ` · ${p.stepName}` : ''}
                  </p>
                </div>
                {p.isLate && <span className="rounded-lg bg-red-100 dark:bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-600 dark:text-red-400">⚠️ ส่งช้า</span>}
              </div>
              <ApprovalActions requestId={p.id} type="WEEKLY_PLAN" {...actionProps} />
              <div className="mt-4 space-y-2">
                {p.days.length === 0 ? (
                  <p className="text-[13px] text-slate-500 rounded-lg bg-slate-50 dark:bg-white/5 px-3 py-2.5">
                    ไม่มีวันออกนอกสถานที่{p.note ? ` · ${p.note}` : ''}
                  </p>
                ) : (
                  p.days.map((d) => (
                    <div key={d.dayOfWeek} className="flex items-start gap-2.5 rounded-lg bg-slate-50 dark:bg-white/5 px-3 py-2.5 text-[13px]">
                      <span className="font-semibold text-blue-600 dark:text-blue-400 w-16 flex-shrink-0">วัน{weeklyDayLabel(d.dayOfWeek)}</span>
                      <span className="text-slate-700 dark:text-slate-300">{d.place ?? '—'} — {d.purpose ?? '—'}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'forgot' && (
        <div className="space-y-3">
          {forgotScanRequests.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 py-14 text-center space-y-3">
              <Clock className="w-12 h-12 mx-auto text-indigo-500/50" />
              <p className="font-semibold text-white text-[15px]">ไม่มีคำขอแก้ไขเวลาค้างอยู่</p>
              <p className="text-[13px] text-slate-500">ทุกคำขอได้รับการดำเนินการแล้ว</p>
            </div>
          ) : forgotScanRequests.map((f) => (
            <div key={f.id} className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900 shadow-sm p-5">
              <PersonHeader
                name={f.user.name}
                subtitle={personSubtitle(f.user)}
                badge={f.stepName ? `ขั้น: ${f.stepName}` : 'รออนุมัติ'}
                accent="purple"
              />
              <ApprovalActions requestId={f.id} type="FORGOT_SCAN" {...actionProps} />
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[13px]">
                <div className="rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-transparent p-3">
                  <p className="text-slate-500 text-[12px]">วันที่</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{formatThaiDate(f.date)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-transparent p-3">
                  <p className="text-slate-500 text-[12px]">ประเภท / เวลา</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {SCAN_TYPE_LABELS[f.scanType] ?? f.scanType} · {new Date(f.correctTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              {f.reason && <p className="mt-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-transparent px-3 py-2.5 text-[13px] text-slate-700 dark:text-slate-300">📝 {f.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
