'use client'

import { useEffect, useState } from 'react'
import { Loader2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

type HistoryItem = {
  id: string
  at: string
  actorName: string
  changes: string[]
}

function formatThaiDateTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function formatThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Lazy-loaded — data only fetches once this tab is actually opened, so
 *  visiting the "ทั่วไป"/"การทำงาน" tabs (the common case) never touches
 *  the audit log query. */
export default function EmployeeEditHistoryTab({ employeeId, active }: { employeeId: string; active: boolean }) {
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [items, setItems] = useState<HistoryItem[]>([])
  const [trackingStartedAt, setTrackingStartedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!active || loaded || loading) return

    let cancelled = false
    const load = async () => {
      setLoading(true)
      const { ok, data, status } = await apiJson<{ history: HistoryItem[]; trackingStartedAt: string }>(
        `/api/users/${employeeId}/history`,
      )
      if (cancelled) return
      if (!ok) {
        toast.error(apiErrorMessage(data, 'โหลดประวัติไม่สำเร็จ', status))
        setLoading(false)
        return
      }
      setItems(data.history ?? [])
      setTrackingStartedAt(data.trackingStartedAt ?? null)
      setLoaded(true)
      setLoading(false)
    }
    void load()

    return () => { cancelled = true }
  }, [active, loaded, loading, employeeId])

  if (!active) return null

  if (loading && !loaded) {
    return (
      <div className="glass-card rounded-2xl p-8 flex items-center justify-center gap-2 text-white/40 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดประวัติ...
      </div>
    )
  }

  if (loaded && items.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center space-y-1.5">
        <p className="text-sm text-white/60">ยังไม่มีประวัติการแก้ไข</p>
        {trackingStartedAt && (
          <p className="text-xs text-white/30">
            ระบบเริ่มบันทึกตั้งแต่ {formatThaiDate(trackingStartedAt)} (ก่อนหน้านั้นไม่มีข้อมูลย้อนหลัง)
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="glass-card rounded-2xl p-5 space-y-3">
      <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
        <Clock className="w-4 h-4 text-violet-400" /> ประวัติการแก้ไขข้อมูล
      </h2>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <time className="text-xs font-medium text-slate-300" dateTime={item.at}>
                {formatThaiDateTime(item.at)}
              </time>
              <span className="text-[11px] text-slate-500">โดย {item.actorName}</span>
            </div>
            <ul className="space-y-1">
              {item.changes.map((line, i) => (
                <li key={i} className="text-xs leading-relaxed text-slate-400 pl-3 border-l-2 border-green-500/40">
                  {line}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
