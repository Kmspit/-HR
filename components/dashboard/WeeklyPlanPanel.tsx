'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, MapPin, Crosshair } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatThaiDate } from '@/lib/utils'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { WEEKLY_PLAN_DAYS, weeklyDayLabel } from '@/lib/weekly-plan-days'

type DayPlan = {
  dayOfWeek: number
  startTime: string
  endTime: string
  place: string
  purpose: string
  client: string
  note: string
  lat: number | null
  lng: number | null
}
type Plan = {
  id: string
  weekStart: string
  weekEnd: string
  status: string
  approvalStatus?: string | null
  supervisorComment?: string | null
  executiveComment?: string | null
  isLate: boolean
  note: string | null
  lawyer: { name: string }
  days: (DayPlan & { id?: string })[]
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:                'text-yellow-400 bg-yellow-500/10',
  ADMIN_APPROVED:         'text-green-400 bg-green-500/10',
  APPROVED:               'text-green-400 bg-green-500/10',
  REJECTED:               'text-red-400 bg-red-500/10',
  pending_supervisor:     'text-yellow-400 bg-yellow-500/10',
  pending_executive:      'text-green-400 bg-green-500/10',
  approved:               'text-green-400 bg-green-500/10',
  approved_by_executive:  'text-green-400 bg-green-500/10',
  rejected_by_supervisor: 'text-red-400 bg-red-500/10',
  rejected_by_executive:  'text-orange-400 bg-orange-500/10',
}
const STATUS_LABELS: Record<string, string> = {
  PENDING:                'รออนุมัติ',
  ADMIN_APPROVED:         'ผ่านหัวหน้างาน',
  APPROVED:               'อนุมัติแล้ว',
  REJECTED:               'ปฏิเสธ',
  pending_supervisor:     'รอหัวหน้างานอนุมัติ',
  pending_executive:      'รอผู้บริหารอนุมัติ',
  approved:               'อนุมัติสมบูรณ์',
  approved_by_executive:  'อนุมัติแล้ว',
  rejected_by_supervisor: 'หัวหน้างานไม่อนุมัติ',
  rejected_by_executive:  'ผู้บริหารไม่อนุมัติ',
}

export default function WeeklyPlanPanel({ plans, nextWeek, deadline, isLawyer }: { plans: Plan[]; nextWeek: { start: string; end: string }; deadline: string; isLawyer: boolean }) {
  const [tab, setTab] = useState<'submit' | 'history'>('submit')
  const [loading, setLoading] = useState(false)
  const [capturingGps, setCapturingGps] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [days, setDays] = useState<DayPlan[]>(
    WEEKLY_PLAN_DAYS.map((d) => ({
      dayOfWeek: d.id,
      startTime: '08:00',
      endTime: '17:00',
      place: '',
      purpose: '',
      client: '',
      note: '',
      lat: null,
      lng: null,
    })),
  )
  const router = useRouter()

  const deadlineDate = new Date(deadline)
  const now = new Date()
  const isLate = now > deadlineDate
  const hoursLeft = Math.max(0, Math.floor((deadlineDate.getTime() - now.getTime()) / 3600000))

  const setDay = (dayOfWeek: number, key: keyof DayPlan, val: string | number | null) => {
    setDays((prev) => prev.map((d) => d.dayOfWeek === dayOfWeek ? { ...d, [key]: val } : d))
  }

  const captureGps = (dayOfWeek: number) => {
    if (!navigator.geolocation) { toast.error('Browser ไม่รองรับ GPS'); return }
    setCapturingGps(dayOfWeek)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDays((prev) => prev.map((d) => d.dayOfWeek === dayOfWeek
          ? { ...d, lat: pos.coords.latitude, lng: pos.coords.longitude }
          : d
        ))
        toast.success('บันทึก GPS เรียบร้อย')
        setCapturingGps(null)
      },
      (err) => {
        toast.error(`GPS: ${err.message}`)
        setCapturingGps(null)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const clearGps = (dayOfWeek: number) => {
    setDays((prev) => prev.map((d) => d.dayOfWeek === dayOfWeek ? { ...d, lat: null, lng: null } : d))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const filledDays = days.filter((d) => d.place.trim() || d.purpose.trim())
    setLoading(true)
    try {
      const { ok, data, status } = await apiJson('/api/weekly-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart: nextWeek.start,
          weekEnd: nextWeek.end,
          days: filledDays,
          note: note.trim() || (filledDays.length === 0 ? 'อยู่ที่ออฟฟิศ / ไม่มีงานนอกสถานที่ในสัปดาห์นี้' : note),
          isLate,
        }),
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status)); return }
      toast.success(
        filledDays.length === 0
          ? 'ส่งแผนงานแล้ว (ไม่มีวันออกนอกสถานที่) รอหัวหน้างานอนุมัติ'
          : 'ส่งแผนงานเรียบร้อย รอหัวหน้างานอนุมัติ',
      )
      router.refresh()
      setTab('history')
    } catch (err) {
      console.error('[weekly-plan]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    }
    finally { setLoading(false) }
  }

  const inputCls = 'w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-green-500/50'

  return (
    <div className="p-5 space-y-5">
      {/* Deadline banner */}
      <div className={`rounded-2xl border p-4 flex items-center gap-3 ${isLate ? 'border-red-500/30 bg-red-500/10' : hoursLeft < 24 ? 'border-yellow-500/30 bg-yellow-500/10' : 'border-green-500/20 bg-green-500/5'}`}>
        <span className="text-2xl">{isLate ? '⚠️' : '⏰'}</span>
        <div>
          <p className={`font-semibold text-sm ${isLate ? 'text-red-400' : hoursLeft < 24 ? 'text-yellow-400' : 'text-green-400'}`}>
            {isLate ? 'เกินกำหนดส่งแล้ว!' : `กำหนดส่ง: ${formatThaiDate(deadline)}`}
          </p>
          <p className="text-xs text-slate-400">
            {isLate ? 'ยังสามารถส่งได้ แต่จะถูกบันทึกว่าส่งช้า' : `เหลือเวลา ${hoursLeft} ชั่วโมง`}
          </p>
        </div>
      </div>

      {/* GPS validation info banner */}
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 flex items-start gap-2.5">
        <MapPin className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-slate-400">
          <span className="text-green-400 font-semibold">บันทึก GPS ต่อวัน</span> เพื่อให้ระบบตรวจสอบตำแหน่งเช็คอินนอกสถานที่ — หากเช็คอินห่างเกิน 500 เมตร ระบบจะแจ้งหัวหน้างานและ CEO โดยอัตโนมัติ
        </p>
      </div>

      {isLawyer && (
        <div className="flex gap-1 rounded-xl bg-slate-900 p-1 border border-white/5">
          {[{ id: 'submit' as const, label: '📝 ส่งแผนงาน' }, { id: 'history' as const, label: `📜 ประวัติ (${plans.length})` }].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-1 items-center justify-center rounded-lg py-2 text-xs font-semibold transition-all ${tab === t.id ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'}`}>{t.label}</button>
          ))}
        </div>
      )}

      {(tab === 'submit' && isLawyer) && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border border-white/5 bg-slate-900 p-4">
            <p className="text-sm font-semibold text-white mb-1">สัปดาห์: {formatThaiDate(nextWeek.start)} — {formatThaiDate(nextWeek.end)}</p>
            <p className="text-xs text-slate-400">
              กรอกเฉพาะวันที่ออกนอกสถานที่ (จันทร์–อาทิตย์) — วันไหนอยู่ออฟฟิศไม่ต้องกรอก · ส่งได้แม้ไม่มีวันออกนอก
            </p>
          </div>

          {WEEKLY_PLAN_DAYS.map((day) => {
            const d = days.find(x => x.dayOfWeek === day.id)!
            const hasEntry = !!(d.place.trim() || d.purpose.trim())
            const hasGps = d.lat != null && d.lng != null
            const isCapturing = capturingGps === day.id
            return (
              <div
                key={day.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  hasEntry ? 'border-green-500/20 bg-slate-900' : 'border-white/5 bg-slate-900/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-sm font-semibold text-white">{day.label}</p>
                  <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[12px] text-slate-500">ไม่บังคับ</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  <div><label className="block text-[12px] text-slate-500 mb-1">เวลา</label>
                    <div className="flex items-center gap-1"><input type="time" className={inputCls} value={d.startTime} onChange={(e) => setDay(day.id, 'startTime', e.target.value)} /><span className="text-slate-500 text-xs">—</span><input type="time" className={inputCls} value={d.endTime} onChange={(e) => setDay(day.id, 'endTime', e.target.value)} /></div>
                  </div>
                  <div><label className="block text-[12px] text-slate-500 mb-1">สถานที่</label><input type="text" placeholder="สถานที่..." className={inputCls} value={d.place} onChange={(e) => setDay(day.id, 'place', e.target.value)} /></div>
                  <div><label className="block text-[12px] text-slate-500 mb-1">วัตถุประสงค์</label><input type="text" placeholder="วัตถุประสงค์..." className={inputCls} value={d.purpose} onChange={(e) => setDay(day.id, 'purpose', e.target.value)} /></div>
                  <div><label className="block text-[12px] text-slate-500 mb-1">ลูกค้า/หน่วยงาน</label><input type="text" placeholder="ชื่อลูกค้า..." className={inputCls} value={d.client} onChange={(e) => setDay(day.id, 'client', e.target.value)} /></div>
                </div>

                {/* GPS capture */}
                <div className="mt-2 flex items-center gap-2">
                  {hasGps ? (
                    <>
                      <div className="flex items-center gap-1.5 rounded-lg bg-green-500/10 border border-green-500/20 px-2.5 py-1.5 text-[12px] text-green-400">
                        <MapPin className="w-3 h-3" />
                        <span className="font-mono">{d.lat!.toFixed(5)}, {d.lng!.toFixed(5)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => clearGps(day.id)}
                        className="text-[12px] text-slate-500 hover:text-red-400 px-2 py-1"
                      >
                        ลบ GPS
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isCapturing}
                      onClick={() => captureGps(day.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/60 px-2.5 py-1.5 text-[12px] text-slate-400 hover:text-white hover:border-white/20 transition disabled:opacity-50"
                    >
                      {isCapturing
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> กำลังอ่าน GPS...</>
                        : <><Crosshair className="w-3 h-3" /> 📍 บันทึก GPS ตำแหน่งนี้</>
                      }
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">หมายเหตุเพิ่มเติม</label>
            <textarea
              rows={2}
              placeholder="เช่น อยู่ออฟฟิศทั้งสัปดาห์ / ไม่มีนัดนอกสถานที่..."
              className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none resize-none focus:border-green-500/50"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white hover:bg-green-500 transition-all disabled:opacity-60">
            {loading ? <><Loader2 size={16} className="animate-spin" /> กำลังส่ง...</> : '📤 ส่งแผนงาน'}
          </button>
        </form>
      )}

      {(tab === 'history' || !isLawyer) && (
        <div className="space-y-3">
          {plans.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 p-8 text-center text-slate-500">ยังไม่มีแผนงาน</div>
          ) : plans.map((p) => {
            const displayStatus = p.approvalStatus ?? p.status
            const rejectionComment =
              displayStatus === 'rejected_by_supervisor' ? p.supervisorComment :
              displayStatus === 'rejected_by_executive'  ? p.executiveComment  : null
            return (
            <div key={p.id} className="rounded-2xl border border-white/5 bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-white">{isLawyer ? '' : p.lawyer.name + ' · '}{formatThaiDate(p.weekStart)} — {formatThaiDate(p.weekEnd)}</p>
                  {p.isLate && <span className="text-[12px] text-red-400">⚠️ ส่งช้า</span>}
                </div>
                <span className={`rounded-lg px-2 py-0.5 text-[12px] font-bold ${STATUS_COLORS[displayStatus] ?? ''}`}>{STATUS_LABELS[displayStatus] ?? displayStatus}</span>
              </div>
              {rejectionComment && (
                <p className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">❌ {rejectionComment}</p>
              )}
              <div className="space-y-1">
                {p.days.length === 0 ? (
                  <p className="text-xs text-slate-500 rounded-lg bg-white/5 px-3 py-2">
                    ไม่มีวันออกนอกสถานที่{p.note ? ` · ${p.note}` : ''}
                  </p>
                ) : (
                  p.days.map((d) => (
                    <div key={d.dayOfWeek} className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs">
                      <span className="font-semibold text-green-400 w-16 flex-shrink-0">{weeklyDayLabel(d.dayOfWeek)}</span>
                      <span className="text-slate-300 flex-1">{d.place} — {d.purpose}</span>
                      {d.lat != null && d.lng != null && (
                        <span className="flex items-center gap-1 text-green-400 text-[12px] flex-shrink-0">
                          <MapPin className="w-2.5 h-2.5" /> GPS
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )
          })}
        </div>
      )}
    </div>
  )
}
