'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface DashboardKPI {
  activeCases:      number
  completedCases:   number
  totalRecovery:    number
  collectionRate:   number
  upcomingHearings: number
  recentPayments:   RecentPayment[]
  highRiskDebtors:  number
}

interface RecentPayment {
  id:          string
  amount:      number
  paymentDate: string
  status:      string
  case:        { caseNumber: string; title: string }
}

interface PortalCase {
  id:         string
  caseNumber: string
  title:      string
  status:     string
  caseType:   string
  priority:   string
  updatedAt:  string
  debtor:     { firstName: string; lastName: string; totalDebt: number; riskLevel: string }
  assignedLawyer: { name: string } | null
  _count:     { courtEvents: number }
}

interface Payment {
  id:          string
  amount:      number
  paymentDate: string
  paymentType: string
  status:      string
  note:        string | null
  case:        { caseNumber: string; title: string }
}

interface PromiseToPay {
  id:          string
  amount:      number
  promiseDate: string
  status:      string
  case:        { caseNumber: string; title: string }
}

interface CourtEvent {
  id:              string
  courtName:       string
  courtType:       string
  appointmentType: string
  appointmentDate: string
  appointmentTime: string | null
  location:        string | null
  status:          string
  priority:        string
  case:            { id: string; caseNumber: string; title: string }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMoney(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const CASE_STATUS: Record<string, string> = {
  OPEN: 'เปิดคดี', IN_PROGRESS: 'กำลังดำเนิน', PENDING: 'รอดำเนินการ',
  CLOSED: 'ปิดคดี', SUSPENDED: 'ระงับ',
}
const CASE_STATUS_COLOR: Record<string, string> = {
  OPEN:        'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  PENDING:     'bg-gray-100 text-gray-600',
  CLOSED:      'bg-green-100 text-green-700',
  SUSPENDED:   'bg-red-100 text-red-700',
}
const COURT_STATUS_COLOR: Record<string, string> = {
  SCHEDULED:   'bg-blue-100 text-blue-700',
  CONFIRMED:   'bg-green-100 text-green-700',
  COMPLETED:   'bg-gray-100 text-gray-500',
  MISSED:      'bg-red-100 text-red-700',
  RESCHEDULED: 'bg-yellow-100 text-yellow-700',
}
const COURT_PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-500 text-white',
  HIGH:     'bg-orange-500 text-white',
  NORMAL:   'bg-blue-500 text-white',
  LOW:      'bg-gray-400 text-white',
}

interface Props {
  fullName:        string
  email:           string
  clientCompanyId: string
}

type Tab = 'overview' | 'cases' | 'recovery' | 'calendar'

export default function PortalDashboard({ fullName, email }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')

  const [kpi,     setKpi]     = useState<DashboardKPI | null>(null)
  const [kpiLoad, setKpiLoad] = useState(true)

  const [cases,      setCases]      = useState<PortalCase[]>([])
  const [casesLoad,  setCasesLoad]  = useState(false)
  const [casesTotal, setCasesTotal] = useState(0)
  const [casesPage,  setCasesPage]  = useState(1)

  const [payments,     setPayments]     = useState<Payment[]>([])
  const [promises,     setPromises]     = useState<PromiseToPay[]>([])
  const [recoveryRows, setRecoveryRows] = useState(0)
  const [recoveryLoad, setRecoveryLoad] = useState(false)

  const [events,  setEvents]  = useState<CourtEvent[]>([])
  const [calLoad, setCalLoad] = useState(false)

  useEffect(() => {
    fetch('/api/client-portal/dashboard')
      .then((r) => r.json())
      .then((d) => setKpi(d))
      .finally(() => setKpiLoad(false))
  }, [])

  const loadCases = useCallback((page = 1) => {
    setCasesLoad(true)
    fetch(`/api/client-portal/cases?page=${page}`)
      .then((r) => r.json())
      .then((d) => {
        setCases(d.cases ?? [])
        setCasesTotal(d.total ?? 0)
        setCasesPage(page)
      })
      .finally(() => setCasesLoad(false))
  }, [])

  const loadRecovery = useCallback(() => {
    setRecoveryLoad(true)
    fetch('/api/client-portal/recovery')
      .then((r) => r.json())
      .then((d) => {
        setPayments(d.payments ?? [])
        setPromises(d.promises ?? [])
        setRecoveryRows(d.total ?? 0)
      })
      .finally(() => setRecoveryLoad(false))
  }, [])

  const loadCalendar = useCallback(() => {
    setCalLoad(true)
    fetch('/api/client-portal/calendar')
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .finally(() => setCalLoad(false))
  }, [])

  useEffect(() => {
    if (tab === 'cases'    && cases.length    === 0) loadCases()
    if (tab === 'recovery' && payments.length === 0) loadRecovery()
    if (tab === 'calendar' && events.length   === 0) loadCalendar()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogout() {
    await fetch('/api/client-portal/auth/logout', { method: 'POST' })
    router.push('/client-portal/login')
    router.refresh()
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',  label: 'ภาพรวม' },
    { key: 'cases',     label: 'คดีของบริษัท' },
    { key: 'recovery',  label: 'การชำระเงิน' },
    { key: 'calendar',  label: 'ปฏิทินศาล' },
  ]

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">KM</div>
          <div>
            <div className="font-semibold text-gray-800 text-sm leading-tight">KM Service Plus</div>
            <div className="text-xs text-gray-400">Client Portal</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-gray-800">{fullName}</div>
            <div className="text-xs text-gray-500">{email}</div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded border border-gray-200 hover:border-red-200 transition-colors">
            ออกจากระบบ
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <div className="bg-white border-b border-gray-200 px-4 flex gap-0 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <main className="flex-1 px-4 py-5 max-w-5xl mx-auto w-full">

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div className="flex flex-col gap-5">
            {kpiLoad ? (
              <div className="text-center py-16 text-gray-400 text-sm">กำลังโหลด...</div>
            ) : kpi ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'คดีที่ดำเนินการอยู่', value: String(kpi.activeCases),             color: 'bg-blue-50   text-blue-700' },
                    { label: 'คดีที่ปิดแล้ว',        value: String(kpi.completedCases),          color: 'bg-green-50  text-green-700' },
                    { label: 'ยอดเรียกคืน (บาท)',    value: fmtMoney(kpi.totalRecovery),          color: 'bg-emerald-50 text-emerald-700' },
                    { label: 'อัตราเรียกคืน',        value: `${kpi.collectionRate}%`,             color: 'bg-indigo-50  text-indigo-700' },
                  ].map((c) => (
                    <div key={c.label} className={`rounded-xl p-4 ${c.color}`}>
                      <div className="text-2xl font-bold">{c.value}</div>
                      <div className="text-xs mt-1 font-medium opacity-80">{c.label}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-xs text-gray-500 mb-1">นัดศาลใน 7 วัน</div>
                    <div className="text-3xl font-bold text-purple-600">{kpi.upcomingHearings}</div>
                    <div className="text-xs text-gray-400 mt-1">นัด</div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-xs text-gray-500 mb-1">ลูกหนี้ความเสี่ยงสูง</div>
                    <div className="text-3xl font-bold text-red-600">{kpi.highRiskDebtors}</div>
                    <div className="text-xs text-gray-400 mt-1">ราย</div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-xs text-gray-500 mb-1">รายการชำระล่าสุด (30 วัน)</div>
                    <div className="text-3xl font-bold text-gray-800">{kpi.recentPayments.length}</div>
                    <div className="text-xs text-gray-400 mt-1">รายการ</div>
                  </div>
                </div>

                {kpi.recentPayments.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="font-medium text-gray-700 mb-3 text-sm">การชำระเงินล่าสุด</div>
                    <div className="flex flex-col gap-2">
                      {kpi.recentPayments.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                          <div>
                            <div className="text-sm text-gray-800">{p.case.caseNumber} — {p.case.title}</div>
                            <div className="text-xs text-gray-400">{fmtDate(p.paymentDate)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-green-600">&#3647;{fmtMoney(p.amount)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16 text-gray-400 text-sm">ไม่สามารถโหลดข้อมูลได้</div>
            )}
          </div>
        )}

        {/* ── Cases ── */}
        {tab === 'cases' && (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-gray-500">พบ {casesTotal} คดี</div>
            {casesLoad ? (
              <div className="text-center py-16 text-gray-400 text-sm">กำลังโหลด...</div>
            ) : cases.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">ไม่พบคดี</div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {cases.map((c) => (
                    <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-800">{c.caseNumber}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CASE_STATUS_COLOR[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {CASE_STATUS[c.status] ?? c.status}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 mt-0.5 truncate">{c.title}</div>
                        <div className="flex gap-4 mt-1 text-xs text-gray-400 flex-wrap">
                          <span>ลูกหนี้: {c.debtor.firstName} {c.debtor.lastName}</span>
                          {c.assignedLawyer && <span>ทนาย: {c.assignedLawyer.name}</span>}
                          <span>ศาล: {c._count.courtEvents} นัด</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-gray-800">&#3647;{fmtMoney(c.debtor.totalDebt)}</div>
                        <div className="text-xs text-gray-400">หนี้รวม</div>
                        <div className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-block ${
                          c.debtor.riskLevel === 'HIGH'
                            ? 'bg-red-100 text-red-600'
                            : c.debtor.riskLevel === 'MEDIUM'
                            ? 'bg-yellow-100 text-yellow-600'
                            : 'bg-green-100 text-green-600'
                        }`}>
                          ความเสี่ยง: {c.debtor.riskLevel}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {casesTotal > 20 && (
                  <div className="flex justify-center gap-2 pt-2">
                    <button
                      disabled={casesPage === 1}
                      onClick={() => loadCases(casesPage - 1)}
                      className="px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                      ก่อนหน้า
                    </button>
                    <span className="px-4 py-2 text-sm text-gray-500">หน้า {casesPage}</span>
                    <button
                      disabled={casesPage * 20 >= casesTotal}
                      onClick={() => loadCases(casesPage + 1)}
                      className="px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                      ถัดไป
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Recovery ── */}
        {tab === 'recovery' && (
          <div className="flex flex-col gap-4">
            {recoveryLoad ? (
              <div className="text-center py-16 text-gray-400 text-sm">กำลังโหลด...</div>
            ) : (
              <>
                {promises.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="font-medium text-amber-800 mb-3 text-sm">สัญญาชำระเงินที่รอดำเนินการ</div>
                    <div className="flex flex-col gap-2">
                      {promises.map((p) => (
                        <div key={p.id} className="flex items-center justify-between py-1.5">
                          <div>
                            <div className="text-sm text-gray-800">{p.case.caseNumber}</div>
                            <div className="text-xs text-gray-500">กำหนดชำระ: {fmtDate(p.promiseDate)}</div>
                          </div>
                          <div className="text-sm font-semibold text-amber-700">&#3647;{fmtMoney(p.amount)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="font-medium text-gray-700 mb-3 text-sm">ประวัติการชำระเงิน ({recoveryRows} รายการ)</div>
                  {payments.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">ยังไม่มีรายการชำระเงิน</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {payments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                          <div>
                            <div className="text-sm text-gray-800">{p.case.caseNumber} — {p.case.title}</div>
                            <div className="text-xs text-gray-400">{fmtDate(p.paymentDate)} · {p.paymentType}</div>
                            {p.note && <div className="text-xs text-gray-400 italic">{p.note}</div>}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-green-600">&#3647;{fmtMoney(p.amount)}</div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'RECEIVED' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                              {p.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Calendar ── */}
        {tab === 'calendar' && (
          <div className="flex flex-col gap-3">
            {calLoad ? (
              <div className="text-center py-16 text-gray-400 text-sm">กำลังโหลด...</div>
            ) : events.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">ไม่มีนัดพิจารณาคดี</div>
            ) : (
              <>
                <div className="text-sm text-gray-500">{events.length} นัดใน 90 วันข้างหน้า</div>
                <div className="flex flex-col gap-3">
                  {events.map((ev) => (
                    <div key={ev.id} className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="font-medium text-sm text-gray-800">{ev.case.caseNumber} — {ev.case.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{ev.courtName}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COURT_STATUS_COLOR[ev.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {ev.status}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COURT_PRIORITY_COLOR[ev.priority] ?? 'bg-gray-400 text-white'}`}>
                            {ev.priority}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
                        <span>{fmtDate(ev.appointmentDate)} {ev.appointmentTime ?? ''}</span>
                        <span>{ev.courtType} / {ev.appointmentType}</span>
                        {ev.location && <span>{ev.location}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
