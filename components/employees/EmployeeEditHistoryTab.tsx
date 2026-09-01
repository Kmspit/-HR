'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { Loader2, Clock, AlertTriangle, RotateCcw } from 'lucide-react'
import { apiJson } from '@/lib/client-api'
import {
  historyLoadReducer,
  initialHistoryLoadState,
  shouldStartHistoryLoad,
  type HistoryLoadItem,
} from '@/lib/employee-history-load'

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
 *  the audit log query. Stays mounted across tab switches (parent renders
 *  it unconditionally) so switching away and back never refetches. */
export default function EmployeeEditHistoryTab({ employeeId, active }: { employeeId: string; active: boolean }) {
  const [state, dispatch] = useReducer(historyLoadReducer, initialHistoryLoadState)

  // Guards against starting a second fetch — deliberately a ref, not state:
  // a state value read by the same effect that changes it is what caused
  // the original bug (see lib/employee-history-load.ts's header comment).
  // A ref never triggers a re-render, so it can never retrigger this effect.
  const startedRef = useRef(false)
  // Distinguishes "tab hidden" (active:false, component stays mounted — a
  // response arriving then must still resolve normally) from "actually
  // unmounted" (navigated away entirely — nothing left to dispatch to).
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const load = useCallback(async () => {
    dispatch({ type: 'START' })
    let ok = false
    let status = 0
    let data: { history?: HistoryLoadItem[]; trackingStartedAt?: string } = {}
    try {
      const res = await apiJson<{ history: HistoryLoadItem[]; trackingStartedAt: string }>(
        `/api/users/${employeeId}/history`,
      )
      ok = res.ok
      status = res.status
      data = res.data
    } catch {
      ok = false
      status = 0
    } finally {
      // Always dispatch a terminal state here, whatever happened above —
      // this is what guarantees the UI can never get stuck on the loading
      // spinner. Must never be skipped for any reason.
      if (mountedRef.current) {
        if (ok) {
          dispatch({ type: 'SUCCESS', items: data.history ?? [], trackingStartedAt: data.trackingStartedAt ?? null })
        } else {
          dispatch({ type: 'FAILURE', status })
        }
      }
    }
  }, [employeeId])

  useEffect(() => {
    if (!shouldStartHistoryLoad(active, startedRef.current)) return
    startedRef.current = true
    void load()
  }, [active, employeeId, load])

  if (!active) return null

  if (state.phase === 'idle' || state.phase === 'loading') {
    return (
      <div className="glass-card rounded-2xl p-8 flex items-center justify-center gap-2 text-white/40 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดประวัติ...
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="glass-card rounded-2xl p-8 text-center space-y-3">
        <AlertTriangle className="w-5 h-5 text-red-400 mx-auto" />
        <p className="text-sm text-white/60">{state.message}</p>
        {state.canRetry && (
          <button
            type="button"
            onClick={() => { void load() }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 text-xs font-semibold transition"
          >
            <RotateCcw className="w-3.5 h-3.5" /> ลองใหม่
          </button>
        )}
      </div>
    )
  }

  // state.phase === 'loaded'
  if (state.items.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center space-y-1.5">
        <p className="text-sm text-white/60">ยังไม่มีประวัติการแก้ไข</p>
        {state.trackingStartedAt && (
          <p className="text-xs text-white/30">
            ระบบเริ่มบันทึกตั้งแต่ {formatThaiDate(state.trackingStartedAt)} (ก่อนหน้านั้นไม่มีข้อมูลย้อนหลัง)
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
        {state.items.map((item) => (
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
