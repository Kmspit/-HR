'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Clock, User, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'

type ProbationEvaluation = {
  id: string
  result: string
  notes: string | null
  evaluatedAt: string | null
}

type Employee = {
  id: string
  name: string
  employeeId: string | null
  department: string | null
  position: string | null
  startDate: string
  probationComplete: boolean
  probationEndDate: string
  evaluation: ProbationEvaluation | null
}

const RESULT_LABELS: Record<string, string> = {
  PASSED: 'ผ่านทดลองงาน',
  FAILED: 'ไม่ผ่านทดลองงาน',
  PENDING: 'รอประเมิน',
}

const RESULT_COLORS: Record<string, string> = {
  PASSED: 'text-green-400 bg-green-500/10 border-green-500/20',
  FAILED: 'text-red-400 bg-red-500/10 border-red-500/20',
  PENDING: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

export default function ProbationClient() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [probationMonths, setProbationMonths] = useState(3)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [evaluating, setEvaluating] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, { result: string; notes: string }>>({})
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('pending')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/probation')
      const data = await res.json()
      setEmployees(data.employees ?? [])
      setProbationMonths(data.probationMonths ?? 3)
    } catch {
      toast.error('โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const submit = async (emp: Employee) => {
    const f = form[emp.id]
    if (!f?.result) { toast.error('กรุณาเลือกผลการประเมิน'); return }
    setEvaluating(emp.id)
    try {
      const res = await fetch('/api/probation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: emp.id, result: f.result, notes: f.notes }),
      })
      if (!res.ok) { toast.error('บันทึกไม่สำเร็จ'); return }
      toast.success(`บันทึกผลประเมิน${emp.name}แล้ว`)
      setExpanded(null)
      await load()
    } catch {
      toast.error('เกิดข้อผิดพลาด')
    } finally {
      setEvaluating(null)
    }
  }

  const filtered = employees.filter((e) => {
    if (filter === 'pending') return e.probationComplete && !e.evaluation
    if (filter === 'done') return !!e.evaluation
    return true
  })

  const pendingCount = employees.filter((e) => e.probationComplete && !e.evaluation).length

  if (loading) return (
    <div className="flex justify-center items-center py-20 text-white/40">
      <Loader2 className="w-6 h-6 animate-spin mr-2" /> กำลังโหลด...
    </div>
  )

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {([['all', 'ทั้งหมด'], ['pending', `รอประเมิน${pendingCount ? ` (${pendingCount})` : ''}`], ['done', 'ประเมินแล้ว']] as const).map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filter === val
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <span className="text-white/30 text-sm ml-auto">ระยะทดลองงาน {probationMonths} เดือน</span>
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[200px] text-white/30">
          <CheckCircle className="w-10 h-10 mb-2 opacity-30" />
          <p>{filter === 'pending' ? 'ไม่มีพนักงานที่รอประเมิน' : 'ไม่พบข้อมูล'}</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((emp) => {
          const isOpen = expanded === emp.id
          const days = daysUntil(emp.probationEndDate)
          const f = form[emp.id] ?? { result: '', notes: '' }
          const result = emp.evaluation?.result ?? (emp.probationComplete ? 'PENDING' : null)

          return (
            <div key={emp.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{emp.name}</p>
                  <p className="text-white/40 text-xs truncate">
                    {emp.department ?? '—'} · เริ่มงาน {formatDate(emp.startDate)}
                  </p>
                </div>
                {result && (
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${RESULT_COLORS[result]}`}>
                    {RESULT_LABELS[result]}
                  </span>
                )}
                {!emp.probationComplete && (
                  <span className="text-white/30 text-xs">ครบใน {Math.abs(days)} วัน</span>
                )}
                <button
                  onClick={() => setExpanded(isOpen ? null : emp.id)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 transition"
                >
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-white/10 p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-white/40 text-xs mb-1">วันที่ครบทดลองงาน</p>
                      <p className="text-white">{formatDate(emp.probationEndDate)}</p>
                    </div>
                    <div>
                      <p className="text-white/40 text-xs mb-1">สถานะ</p>
                      <p className={emp.probationComplete ? 'text-amber-400' : 'text-white/60'}>
                        {emp.probationComplete ? 'ครบกำหนดแล้ว' : `อีก ${Math.abs(days)} วัน`}
                      </p>
                    </div>
                  </div>

                  {emp.evaluation ? (
                    <div className="space-y-2">
                      <p className="text-white/40 text-xs">ผลการประเมิน</p>
                      <div className={`flex items-center gap-2 p-3 rounded-xl border ${RESULT_COLORS[emp.evaluation.result]}`}>
                        {emp.evaluation.result === 'PASSED'
                          ? <CheckCircle className="w-4 h-4" />
                          : <XCircle className="w-4 h-4" />}
                        <span className="text-sm font-medium">{RESULT_LABELS[emp.evaluation.result]}</span>
                      </div>
                      {emp.evaluation.notes && (
                        <p className="text-white/60 text-sm bg-white/5 rounded-xl p-3">{emp.evaluation.notes}</p>
                      )}
                    </div>
                  ) : emp.probationComplete ? (
                    <div className="space-y-3">
                      <p className="text-amber-400 text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4" /> พนักงานครบทดลองงานแล้ว — กรุณาประเมิน
                      </p>
                      <div className="flex gap-3">
                        {(['PASSED', 'FAILED'] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => setForm((prev) => ({ ...prev, [emp.id]: { ...f, result: r } }))}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition ${
                              f.result === r
                                ? r === 'PASSED'
                                  ? 'bg-green-500/20 border-green-500/40 text-green-300'
                                  : 'bg-red-500/20 border-red-500/40 text-red-300'
                                : 'border-white/10 text-white/50 hover:bg-white/5'
                            }`}
                          >
                            {r === 'PASSED' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            {RESULT_LABELS[r]}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={f.notes}
                        onChange={(e) => setForm((prev) => ({ ...prev, [emp.id]: { ...f, notes: e.target.value } }))}
                        placeholder="หมายเหตุ / ข้อเสนอแนะ (ไม่บังคับ)"
                        rows={2}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:border-blue-500/50"
                      />
                      <button
                        onClick={() => submit(emp)}
                        disabled={evaluating === emp.id || !f.result}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40 transition"
                      >
                        {evaluating === emp.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        บันทึกผลการประเมิน
                      </button>
                    </div>
                  ) : (
                    <p className="text-white/30 text-sm">ยังไม่ถึงกำหนดทดลองงาน</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
