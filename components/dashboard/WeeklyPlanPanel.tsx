'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatThaiDate } from '@/lib/utils'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

const DAYS = [
  { id: 1, label: 'วันจันทร์' },
  { id: 2, label: 'วันอังคาร' },
  { id: 3, label: 'วันพุธ' },
  { id: 4, label: 'วันพฤหัสบดี' },
  { id: 5, label: 'วันศุกร์' },
]

type DayPlan = { dayOfWeek: number; startTime: string; endTime: string; place: string; purpose: string; client: string; note: string }
type Plan = { id: string; weekStart: string; weekEnd: string; status: string; isLate: boolean; note: string | null; lawyer: { name: string }; days: DayPlan[] }

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-yellow-400 bg-yellow-500/10', ADMIN_APPROVED: 'text-blue-400 bg-blue-500/10',
  APPROVED: 'text-green-400 bg-green-500/10', REJECTED: 'text-red-400 bg-red-500/10',
}
const STATUS_LABELS: Record<string, string> = { PENDING: 'รออนุมัติ', ADMIN_APPROVED: 'ผ่าน Admin', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ปฏิเสธ' }

export default function WeeklyPlanPanel({ plans, nextWeek, deadline, isLawyer }: { plans: Plan[]; nextWeek: { start: string; end: string }; deadline: string; isLawyer: boolean }) {
  const [tab, setTab] = useState<'submit' | 'history'>('submit')
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [days, setDays] = useState<DayPlan[]>(DAYS.map((d) => ({ dayOfWeek: d.id, startTime: '08:00', endTime: '17:00', place: '', purpose: '', client: '', note: '' })))
  const router = useRouter()

  const deadlineDate = new Date(deadline)
  const now = new Date()
  const isLate = now > deadlineDate
  const hoursLeft = Math.max(0, Math.floor((deadlineDate.getTime() - now.getTime()) / 3600000))

  const setDay = (dayOfWeek: number, key: keyof DayPlan, val: string) => {
    setDays((prev) => prev.map((d) => d.dayOfWeek === dayOfWeek ? { ...d, [key]: val } : d))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const hasSomeDay = days.some((d) => d.place || d.purpose)
    if (!hasSomeDay) { toast.error('กรุณากรอกแผนงานอย่างน้อย 1 วัน'); return }
    setLoading(true)
    try {
      const { ok, data, status } = await apiJson('/api/weekly-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart: nextWeek.start, weekEnd: nextWeek.end, days: days.filter(d => d.place || d.purpose), note, isLate }),
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status)); return }
      toast.success('ส่งแผนงานเรียบร้อย รอ Admin อนุมัติ')
      router.refresh()
      setTab('history')
    } catch (err) {
      console.error('[weekly-plan]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    }
    finally { setLoading(false) }
  }

  const inputCls = 'w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500/50'

  return (
    <div className="p-5 space-y-5">
      {/* Deadline banner */}
      <div className={`rounded-2xl border p-4 flex items-center gap-3 ${isLate ? 'border-red-500/30 bg-red-500/10' : hoursLeft < 24 ? 'border-yellow-500/30 bg-yellow-500/10' : 'border-blue-500/20 bg-blue-500/5'}`}>
        <span className="text-2xl">{isLate ? '⚠️' : '⏰'}</span>
        <div>
          <p className={`font-semibold text-sm ${isLate ? 'text-red-400' : hoursLeft < 24 ? 'text-yellow-400' : 'text-blue-400'}`}>
            {isLate ? 'เกินกำหนดส่งแล้ว!' : `กำหนดส่ง: ${formatThaiDate(deadline)}`}
          </p>
          <p className="text-xs text-slate-400">
            {isLate ? 'ยังสามารถส่งได้ แต่จะถูกบันทึกว่าส่งช้า' : `เหลือเวลา ${hoursLeft} ชั่วโมง`}
          </p>
        </div>
      </div>

      {isLawyer && (
        <div className="flex gap-1 rounded-xl bg-slate-900 p-1 border border-white/5">
          {[{ id: 'submit' as const, label: '📝 ส่งแผนงาน' }, { id: 'history' as const, label: `📜 ประวัติ (${plans.length})` }].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-1 items-center justify-center rounded-lg py-2 text-xs font-semibold transition-all ${tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>{t.label}</button>
          ))}
        </div>
      )}

      {(tab === 'submit' && isLawyer) && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border border-white/5 bg-slate-900 p-4">
            <p className="text-sm font-semibold text-white mb-1">สัปดาห์: {formatThaiDate(nextWeek.start)} — {formatThaiDate(nextWeek.end)}</p>
            <p className="text-xs text-slate-400">กรอกเฉพาะวันที่มีงานนอกสถานที่</p>
          </div>

          {DAYS.map((day) => {
            const d = days.find(x => x.dayOfWeek === day.id)!
            return (
              <div key={day.id} className="rounded-2xl border border-white/5 bg-slate-900 p-4">
                <p className="text-sm font-semibold text-white mb-3">{day.label}</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div><label className="block text-[10px] text-slate-500 mb-1">เวลา</label>
                    <div className="flex items-center gap-1"><input type="time" className={inputCls} value={d.startTime} onChange={(e) => setDay(day.id, 'startTime', e.target.value)} /><span className="text-slate-500 text-xs">—</span><input type="time" className={inputCls} value={d.endTime} onChange={(e) => setDay(day.id, 'endTime', e.target.value)} /></div>
                  </div>
                  <div><label className="block text-[10px] text-slate-500 mb-1">สถานที่</label><input type="text" placeholder="สถานที่..." className={inputCls} value={d.place} onChange={(e) => setDay(day.id, 'place', e.target.value)} /></div>
                  <div><label className="block text-[10px] text-slate-500 mb-1">วัตถุประสงค์</label><input type="text" placeholder="วัตถุประสงค์..." className={inputCls} value={d.purpose} onChange={(e) => setDay(day.id, 'purpose', e.target.value)} /></div>
                  <div><label className="block text-[10px] text-slate-500 mb-1">ลูกค้า/หน่วยงาน</label><input type="text" placeholder="ชื่อลูกค้า..." className={inputCls} value={d.client} onChange={(e) => setDay(day.id, 'client', e.target.value)} /></div>
                </div>
              </div>
            )
          })}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">หมายเหตุเพิ่มเติม</label>
            <textarea rows={2} placeholder="หมายเหตุ..." className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none resize-none focus:border-blue-500/50" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all disabled:opacity-60">
            {loading ? <><Loader2 size={16} className="animate-spin" /> กำลังส่ง...</> : '📤 ส่งแผนงาน'}
          </button>
        </form>
      )}

      {(tab === 'history' || !isLawyer) && (
        <div className="space-y-3">
          {plans.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 p-8 text-center text-slate-500">ยังไม่มีแผนงาน</div>
          ) : plans.map((p) => (
            <div key={p.id} className="rounded-2xl border border-white/5 bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-white">{isLawyer ? '' : p.lawyer.name + ' · '}{formatThaiDate(p.weekStart)} — {formatThaiDate(p.weekEnd)}</p>
                  {p.isLate && <span className="text-[10px] text-red-400">⚠️ ส่งช้า</span>}
                </div>
                <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${STATUS_COLORS[p.status] ?? ''}`}>{STATUS_LABELS[p.status] ?? p.status}</span>
              </div>
              <div className="space-y-1">
                {p.days.map((d) => (
                  <div key={d.dayOfWeek} className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs">
                    <span className="font-semibold text-blue-400 w-16 flex-shrink-0">{['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์'][d.dayOfWeek]}</span>
                    <span className="text-slate-300">{d.place} — {d.purpose}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
