'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatThaiDate } from '@/lib/utils'

type LR = { id: string; type: string; startDate: string; endDate: string; days: number; reason: string; status: string; user: { name: string; email: string; department: string; role: string } }
type OR = { id: string; date: string; startTime: string; endTime: string; place: string; purpose: string; status: string; user: { name: string; email: string; department: string; role: string } }
type WP = { id: string; weekStart: string; weekEnd: string; status: string; isLate: boolean; lawyer: { name: string; email: string }; days: { dayOfWeek: number; place: string; purpose: string }[] }

type Props = {
  leaveRequests: LR[]
  outsideRequests: OR[]
  weeklyPlans: WP[]
  userRole: string
}

const LEAVE_TYPES: Record<string, string> = { SICK: 'ลาป่วย', VACATION: 'ลาพักร้อน', PERSONAL: 'ลากิจ', UNPAID: 'ลาไม่รับค่าจ้าง', MATERNITY: 'ลาคลอด' }
const DAYS_TH = ['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์']

export default function ApprovalPanel({ leaveRequests, outsideRequests, weeklyPlans, userRole }: Props) {
  const [tab, setTab] = useState<'leave' | 'outside' | 'weekly'>('leave')
  const [loading, setLoading] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const router = useRouter()

  const handleAction = async (type: 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN', requestId: string, action: 'APPROVE' | 'REJECT') => {
    if (action === 'REJECT' && !rejectingId) { setRejectingId(requestId); return }
    setLoading(requestId)
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, requestId, action, reason: action === 'REJECT' ? reason : undefined }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'เกิดข้อผิดพลาด'); return }
      toast.success(action === 'APPROVE' ? '✅ อนุมัติเรียบร้อย' : '❌ ปฏิเสธเรียบร้อย')
      setRejectingId(null); setReason('')
      router.refresh()
    } catch { toast.error('เกิดข้อผิดพลาด') }
    finally { setLoading(null) }
  }

  const tabs = [
    { id: 'leave' as const, label: `📅 คำขอลา`, count: leaveRequests.length },
    { id: 'outside' as const, label: `🚗 นอกสถานที่`, count: outsideRequests.length },
    ...(weeklyPlans.length > 0 || userRole === 'MANAGER_HR' ? [{ id: 'weekly' as const, label: `📋 แผนทนาย`, count: weeklyPlans.length }] : []),
  ]

  const stepLabel = userRole === 'ADMIN'
    ? 'Admin กำลังตรวจสอบ (Step 1)'
    : 'Manager / HR Final Approval (Step 2)'

  return (
    <div className="p-5 space-y-5">
      {/* Step badge */}
      <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${userRole === 'ADMIN' ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : 'border-purple-500/30 bg-purple-500/10 text-purple-400'}`}>
        {userRole === 'ADMIN' ? '1️⃣' : '2️⃣'} {stepLabel}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-900 p-1 border border-white/5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            {t.label}
            {t.count > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === t.id ? 'bg-white/20' : 'bg-slate-700'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Leave requests */}
      {tab === 'leave' && (
        <div className="space-y-3">
          {leaveRequests.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 p-8 text-center text-slate-500">ไม่มีคำขอลาที่รอดำเนินการ ✅</div>
          ) : leaveRequests.map((l) => (
            <div key={l.id} className="rounded-2xl border border-white/5 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-lg font-bold text-blue-400">{l.user.name[0]}</div>
                  <div>
                    <p className="font-semibold text-white">{l.user.name}</p>
                    <p className="text-xs text-slate-400">{l.user.department} · {l.user.email}</p>
                  </div>
                </div>
                <span className="rounded-lg bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold text-yellow-400">รออนุมัติ</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-white/5 p-2"><p className="text-slate-500">ประเภท</p><p className="font-semibold text-white">{LEAVE_TYPES[l.type] ?? l.type}</p></div>
                <div className="rounded-lg bg-white/5 p-2"><p className="text-slate-500">ช่วงเวลา</p><p className="font-semibold text-white">{formatThaiDate(l.startDate)} — {formatThaiDate(l.endDate)}</p></div>
                <div className="rounded-lg bg-white/5 p-2"><p className="text-slate-500">จำนวน</p><p className="font-semibold text-white">{l.days} วัน</p></div>
              </div>
              {l.reason && <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-300">📝 {l.reason}</p>}

              {/* Reject reason */}
              {rejectingId === l.id && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="ระบุเหตุผลการปฏิเสธ..."
                    rows={2}
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-red-500/50 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleAction('LEAVE', l.id, 'REJECT')} disabled={!!loading || !reason} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50">
                      {loading === l.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} ยืนยันปฏิเสธ
                    </button>
                    <button onClick={() => { setRejectingId(null); setReason('') }} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400 hover:text-white">ยกเลิก</button>
                  </div>
                </div>
              )}

              {rejectingId !== l.id && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => handleAction('LEAVE', l.id, 'APPROVE')} disabled={!!loading} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-green-600 py-2.5 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50">
                    {loading === l.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} อนุมัติ
                  </button>
                  <button onClick={() => setRejectingId(l.id)} disabled={!!loading} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50">
                    <XCircle size={14} /> ปฏิเสธ
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Outside requests */}
      {tab === 'outside' && (
        <div className="space-y-3">
          {outsideRequests.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 p-8 text-center text-slate-500">ไม่มีคำขอออกนอกสถานที่ ✅</div>
          ) : outsideRequests.map((o) => (
            <div key={o.id} className="rounded-2xl border border-white/5 bg-slate-900 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-lg font-bold text-purple-400">{o.user.name[0]}</div>
                <div>
                  <p className="font-semibold text-white">{o.user.name}</p>
                  <p className="text-xs text-slate-400">{o.user.department}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div className="rounded-lg bg-white/5 p-2"><p className="text-slate-500">วันที่</p><p className="font-semibold text-white">{formatThaiDate(o.date)}</p></div>
                <div className="rounded-lg bg-white/5 p-2"><p className="text-slate-500">เวลา</p><p className="font-semibold text-white">{o.startTime} — {o.endTime}</p></div>
                <div className="col-span-2 rounded-lg bg-white/5 p-2"><p className="text-slate-500">สถานที่</p><p className="font-semibold text-white">{o.place}</p></div>
                <div className="col-span-2 rounded-lg bg-white/5 p-2"><p className="text-slate-500">วัตถุประสงค์</p><p className="font-semibold text-white">{o.purpose}</p></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleAction('OUTSIDE', o.id, 'APPROVE')} disabled={!!loading} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-green-600 py-2.5 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50">
                  {loading === o.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} อนุมัติ
                </button>
                <button onClick={() => { setRejectingId(o.id) }} disabled={!!loading} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50">
                  <XCircle size={14} /> ปฏิเสธ
                </button>
              </div>
              {rejectingId === o.id && (
                <div className="mt-2 flex gap-2">
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผล..." className="flex-1 rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none" />
                  <button onClick={() => handleAction('OUTSIDE', o.id, 'REJECT')} disabled={!reason} className="rounded-xl bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50">ยืนยัน</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Weekly lawyer plans */}
      {tab === 'weekly' && (
        <div className="space-y-3">
          {weeklyPlans.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 p-8 text-center text-slate-500">ไม่มีแผนงานทนายที่รออนุมัติ ✅</div>
          ) : weeklyPlans.map((p) => (
            <div key={p.id} className="rounded-2xl border border-white/5 bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-white">{p.lawyer.name}</p>
                  <p className="text-xs text-slate-400">{formatThaiDate(p.weekStart)} — {formatThaiDate(p.weekEnd)}</p>
                </div>
                {p.isLate && <span className="rounded-lg bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">⚠️ ส่งช้า</span>}
              </div>
              <div className="space-y-1.5 mb-3">
                {p.days.map((d) => (
                  <div key={d.dayOfWeek} className="flex items-start gap-2 rounded-lg bg-white/5 px-2.5 py-2 text-xs">
                    <span className="font-semibold text-blue-400 w-12 flex-shrink-0">วัน{DAYS_TH[d.dayOfWeek]}</span>
                    <span className="text-slate-300">{d.place} — {d.purpose}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleAction('WEEKLY_PLAN', p.id, 'APPROVE')} disabled={!!loading} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-green-600 py-2.5 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50">
                  {loading === p.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} อนุมัติ
                </button>
                <button onClick={() => setRejectingId(p.id)} disabled={!!loading} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50">
                  <XCircle size={14} /> ปฏิเสธ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
