'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Loader2, AlertTriangle, RotateCcw, History, Plus, Star } from 'lucide-react'
import { apiJson } from '@/lib/client-api'
import {
  employmentAssignmentsLoadReducer,
  initialEmploymentAssignmentsLoadState,
  shouldStartEmploymentAssignmentsLoad,
  type EmploymentAssignmentsData,
} from '@/lib/employment-assignments-load'
import { CHANGE_TYPE_LABELS, TERMINATION_TYPE_LABELS } from '@/lib/employment-assignment-labels'
import NewAssignmentModal from '@/components/employees/NewAssignmentModal'

function formatThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}
const currencyFmt = (n: number) => `฿${n.toLocaleString('th-TH')}`

/** Lazy-loaded, same reasoning as the other employee-edit tabs — data only
 *  fetches once this tab is actually opened, stays mounted across tab
 *  switches so switching away and back never refetches or loses the modal
 *  state. */
export default function EmploymentAssignmentHistoryTab({
  employeeId, employeeName, active, branchId, canViewSalary, canManage,
}: {
  employeeId: string
  employeeName: string
  active: boolean
  branchId: string | null
  /** HR_ADMIN only — same gate as the employee's own salary field. Hides
   *  baseSalary from the timeline entirely (the API already omits it from
   *  the response for a non-HR_ADMIN viewer — this just avoids rendering an
   *  empty "เงินเดือน:" line). */
  canViewSalary: boolean
  /** HR_ADMIN only — gates the "สร้างประวัติใหม่" button. Same role list as
   *  canViewSalary today, kept as its own prop for the same reason step 8b's
   *  canViewSensitive was: different capability, coincidentally same roles. */
  canManage: boolean
}) {
  const [state, dispatch] = useReducer(employmentAssignmentsLoadReducer, initialEmploymentAssignmentsLoadState)
  const startedRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])
  const [showNewModal, setShowNewModal] = useState(false)

  const load = useCallback(async () => {
    dispatch({ type: 'START' })
    let ok = false
    let status = 0
    let data: Partial<EmploymentAssignmentsData> = {}
    try {
      const res = await apiJson<EmploymentAssignmentsData>(`/api/users/${employeeId}/employment-assignments`)
      ok = res.ok
      status = res.status
      data = res.data
    } catch {
      ok = false
      status = 0
    } finally {
      if (mountedRef.current) {
        if (ok && data.assignments) {
          dispatch({ type: 'SUCCESS', data: { currentAssignmentId: data.currentAssignmentId ?? null, assignments: data.assignments } })
        } else {
          dispatch({ type: 'FAILURE', status })
        }
      }
    }
  }, [employeeId])

  useEffect(() => {
    if (!shouldStartEmploymentAssignmentsLoad(active, startedRef.current)) return
    startedRef.current = true
    void load()
  }, [active, employeeId, load])

  if (!active) return null

  if (state.phase === 'idle' || state.phase === 'loading') {
    return (
      <div className="glass-card rounded-2xl p-8 flex items-center justify-center gap-2 text-white/40 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดข้อมูล...
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
  const { assignments, currentAssignmentId } = state.data
  const currentAssignment = assignments.find((a) => a.id === currentAssignmentId) ?? null
  // currentAssignmentId is null both when there's no history at all AND when
  // the latest row is a TERMINATION (getCurrentAssignment excludes it) — only
  // the second case means "this employee is currently พ้นสภาพ".
  const isTerminated = assignments.length > 0 && currentAssignmentId === null

  return (
    <div className="space-y-4">
      <section className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
            <History className="w-4 h-4 text-violet-400" /> ประวัติตำแหน่ง
          </h2>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300"
            >
              <Plus size={14} /> สร้างประวัติใหม่
            </button>
          )}
        </div>

        {assignments.length === 0 && (
          <p className="text-sm text-slate-500">ยังไม่มีประวัติตำแหน่ง</p>
        )}

        <ul className="space-y-2">
          {assignments.map((a) => {
            const isCurrent = a.id === currentAssignmentId
            return (
              <li key={a.id} className={`rounded-xl border p-3.5 ${isCurrent ? 'border-green-500/30 bg-green-500/5' : 'border-white/8 bg-white/[0.02]'}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-white">{CHANGE_TYPE_LABELS[a.changeType]}</span>
                    {isCurrent && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 text-[10px]">
                        <Star size={9} className="fill-green-400" /> ปัจจุบัน
                      </span>
                    )}
                  </div>
                  <time className="text-xs text-slate-400" dateTime={a.effectiveFrom}>มีผล {formatThaiDate(a.effectiveFrom)}</time>
                </div>
                <p className="text-xs text-slate-400">
                  {a.positionName}
                  {a.divisionName && ` · ${a.divisionName}`}
                  {a.departmentName && ` / ${a.departmentName}`}
                  {a.sectionName && ` / ${a.sectionName}`}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-500">
                  {canViewSalary && a.baseSalary != null && <span>เงินเดือน {currencyFmt(a.baseSalary)}</span>}
                  {a.terminationType && <span>สาเหตุ: {TERMINATION_TYPE_LABELS[a.terminationType]}</span>}
                  {a.rehireEligible !== null && <span>{a.rehireEligible ? 'มีสิทธิ์กลับมาทำงาน' : 'ไม่มีสิทธิ์กลับมาทำงาน'}</span>}
                  {a.createdByName && <span>โดย {a.createdByName}</span>}
                </div>
                {(a.reason || a.terminationReason || a.note) && (
                  <p className="text-[11px] text-slate-500 mt-1 italic">
                    {[a.reason, a.terminationReason, a.note].filter(Boolean).join(' — ')}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {showNewModal && (
        <NewAssignmentModal
          userId={employeeId}
          userName={employeeName}
          branchId={branchId}
          canEditSalary={canViewSalary}
          currentAssignment={currentAssignment}
          isTerminated={isTerminated}
          onClose={() => setShowNewModal(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  )
}
