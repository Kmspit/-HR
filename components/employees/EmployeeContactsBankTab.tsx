'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { Loader2, AlertTriangle, RotateCcw } from 'lucide-react'
import { apiJson } from '@/lib/client-api'
import {
  personalRecordsLoadReducer,
  initialPersonalRecordsLoadState,
  shouldStartPersonalRecordsLoad,
  type PersonalRecordsData,
} from '@/lib/personal-records-load'
import EmergencyContactSection from '@/components/employees/EmergencyContactSection'
import DependentSection from '@/components/employees/DependentSection'
import BankAccountSection from '@/components/employees/BankAccountSection'

/** Lazy-loaded, same reasoning as EmployeeEditHistoryTab/EmployeeProfileTab —
 *  stays mounted across tab switches so it only fetches once per page visit.
 *  Combines 3 entity types (EmergencyContact/Dependent/BankAccount) into one
 *  tab with 3 sections rather than 3 more top-level tabs — this page already
 *  has 5; a 6th, 7th, 8th tab was judged worse for navigation than 3 clearly
 *  headed sections within one (Phase 1 step 8b). */
export default function EmployeeContactsBankTab({
  employeeId,
  active,
  canViewSensitive,
}: {
  employeeId: string
  active: boolean
  /** HR_ADMIN only — gates the "ดูเลขเต็ม" reveal buttons for dependent
   *  nationalId / bank account number, same as the employee's own
   *  nationalId field. Computed server-side from the viewer's role. */
  canViewSensitive: boolean
}) {
  const [state, dispatch] = useReducer(personalRecordsLoadReducer, initialPersonalRecordsLoadState)
  const startedRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const load = useCallback(async () => {
    dispatch({ type: 'START' })
    let ok = false
    let status = 0
    let data: { emergencyContacts?: PersonalRecordsData['emergencyContacts']; dependents?: PersonalRecordsData['dependents']; bankAccounts?: PersonalRecordsData['bankAccounts'] } = {}
    try {
      const res = await apiJson<PersonalRecordsData>(`/api/users/${employeeId}/personal-records`)
      ok = res.ok
      status = res.status
      data = res.data
    } catch {
      ok = false
      status = 0
    } finally {
      if (mountedRef.current) {
        if (ok) {
          dispatch({
            type: 'SUCCESS',
            data: {
              emergencyContacts: data.emergencyContacts ?? [],
              dependents: data.dependents ?? [],
              bankAccounts: data.bankAccounts ?? [],
            },
          })
        } else {
          dispatch({ type: 'FAILURE', status })
        }
      }
    }
  }, [employeeId])

  useEffect(() => {
    if (!shouldStartPersonalRecordsLoad(active, startedRef.current)) return
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

  // state.phase === 'loaded' — reload() refetches the whole combined list
  // after any mutation, so the 3 sections always agree with the server
  // (simpler and safer than reconciling 3 separate optimistic local states).
  return (
    <div className="space-y-4">
      <EmergencyContactSection employeeId={employeeId} contacts={state.data.emergencyContacts} onReload={() => void load()} />
      <DependentSection employeeId={employeeId} dependents={state.data.dependents} canViewSensitive={canViewSensitive} onReload={() => void load()} />
      <BankAccountSection employeeId={employeeId} accounts={state.data.bankAccounts} canViewSensitive={canViewSensitive} onReload={() => void load()} />
    </div>
  )
}
