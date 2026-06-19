'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface User { id: string; name: string; department: string | null; role: string }

interface Debtor {
  id: string; debtorNumber: string; caseNumber?: string; firstName: string; lastName: string
  nationalId?: string; phone?: string; phone2?: string; phone3?: string; lineId?: string
  email?: string; facebook?: string; workplace?: string; occupation?: string
  incomeEstimate?: number; riskLevel: string; preferredContactTime?: string
  contactPreference?: string; tags: string; workplaceAddress?: string
  registeredAddress?: string; assetAddress?: string; lastContactAt?: string
  address?: string; province?: string; assignedToId?: string; status: string
  totalDebt: number; paidAmount: number; remainingDebt: number; startDate?: string
  note?: string; createdAt: string; updatedAt: string
  assignedTo?: User; createdBy: User
  _count?: { followUps: number; payments: number; appointments: number }
  followUps?: FollowUp[]; payments?: Payment[]; appointments?: Appointment[]
  files?: DebtorFile[]; contacts?: DebtorContact[]; promises?: PromiseToPay[]
}

interface FollowUp {
  id: string; method: string; followedAt: string; result: string; note?: string
  nextFollowUp?: string; performedBy: User; createdAt: string
}

interface Payment {
  id: string; amount: number; paidAt: string; channel: string; note?: string
  receivedBy?: User; createdBy: User; createdAt: string
}

interface Appointment {
  id: string; appointDate: string; agreedAmount: number; location?: string
  note?: string; status: string; createdBy: User; createdAt: string
}

interface DebtorFile {
  id: string; url: string; filename: string; fileType: string; size: number
  docType: string; createdBy: User; createdAt: string
}

interface DebtorContact {
  id: string; channel: string; direction: string; result: string; note?: string
  duration?: number; promisedAt?: string; promisedAmount?: number; nextContactAt?: string
  performedBy: User; createdAt: string
}

interface PromiseToPay {
  id: string; promisedAmount: number; promisedDate: string; actualAmount?: number
  actualDate?: string; status: string; note?: string; createdBy: User; createdAt: string
}

interface Summary {
  totalDebtors: number; statusMap: Record<string, number>
  totalDebt: number; paidAmount: number; remainingDebt: number
  monthCollected: number; upcomingAppts: number; overdueAppts: number
  recoveryRate: number; topRemaining: Partial<Debtor>[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const RISK_LABELS: Record<string, string> = { LOW: 'ต่ำ', MEDIUM: 'ปานกลาง', HIGH: 'สูง', CRITICAL: 'วิกฤต' }
const RISK_COLORS: Record<string, string> = {
  LOW: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  MEDIUM: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const CONTACT_CHANNELS = ['PHONE', 'LINE', 'SMS', 'EMAIL', 'VISIT']
const CHANNEL_LABELS: Record<string, string> = { PHONE: 'โทรศัพท์', LINE: 'LINE', SMS: 'SMS', EMAIL: 'Email', VISIT: 'เข้าพบ' }
const CONTACT_RESULTS = ['REACHED', 'NO_ANSWER', 'WRONG_NUMBER', 'DISCONNECTED', 'REFUSED', 'LEFT_MESSAGE']
const RESULT_LABELS: Record<string, string> = {
  REACHED: 'ติดต่อได้', NO_ANSWER: 'ไม่รับสาย', WRONG_NUMBER: 'เบอร์ผิด',
  DISCONNECTED: 'สายหลุด', REFUSED: 'ปฏิเสธ', LEFT_MESSAGE: 'ฝากข้อความ',
}
const RESULT_COLORS: Record<string, string> = {
  REACHED: 'bg-green-100 text-green-700', NO_ANSWER: 'bg-gray-100 text-gray-600',
  WRONG_NUMBER: 'bg-red-100 text-red-700', DISCONNECTED: 'bg-orange-100 text-orange-700',
  REFUSED: 'bg-red-100 text-red-700', LEFT_MESSAGE: 'bg-blue-100 text-blue-700',
}

const PROMISE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'รอชำระ', KEPT: 'ชำระแล้ว', PARTIALLY_KEPT: 'ชำระบางส่วน',
  BROKEN: 'ผิดสัญญา', CANCELLED: 'ยกเลิก',
}
const PROMISE_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700', KEPT: 'bg-green-100 text-green-700',
  PARTIALLY_KEPT: 'bg-blue-100 text-blue-700', BROKEN: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

const STATUSES = ['NEW', 'FOLLOWING', 'PROMISE_TO_PAY', 'PARTIAL_PAYMENT', 'PAID', 'LEGAL_ACTION', 'OVERDUE', 'UNREACHABLE']
const STATUS_LABELS: Record<string, string> = {
  NEW: 'รับเรื่องใหม่', FOLLOWING: 'กำลังติดตาม', PROMISE_TO_PAY: 'นัดชำระแล้ว',
  PARTIAL_PAYMENT: 'ชำระบางส่วน', PAID: 'ชำระแล้ว', LEGAL_ACTION: 'ดำเนินคดี',
  OVERDUE: 'เกินกำหนด', UNREACHABLE: 'ติดต่อไม่ได้',
}
const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-gray-100 text-gray-700', FOLLOWING: 'bg-blue-100 text-blue-700',
  PROMISE_TO_PAY: 'bg-yellow-100 text-yellow-700', PARTIAL_PAYMENT: 'bg-orange-100 text-orange-700',
  PAID: 'bg-green-100 text-green-700', LEGAL_ACTION: 'bg-red-100 text-red-700',
  OVERDUE: 'bg-red-100 text-red-800', UNREACHABLE: 'bg-gray-200 text-gray-600',
}
const FOLLOW_METHODS = ['โทรศัพท์', 'LINE', 'SMS', 'Email', 'เข้าพบ']
const APPT_STATUSES  = ['PENDING', 'KEPT', 'MISSED', 'CANCELLED']
const APPT_LABELS: Record<string, string> = { PENDING: 'รอชำระ', KEPT: 'ชำระแล้ว', MISSED: 'ผิดนัด', CANCELLED: 'ยกเลิก' }
const APPT_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700', KEPT: 'bg-green-100 text-green-700',
  MISSED: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-600',
}
const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0 })
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ─── Component ────────────────────────────────────────────────────────────────

export default function DebtorsClient({ userId, userRole, userName }: { userId: string; userRole: string; userName: string }) {
  const canManage  = CAN_MANAGE.includes(userRole)
  const [mainTab, setMainTab]       = useState<'list' | 'dashboard'>('list')
  const [debtors,  setDebtors]      = useState<Debtor[]>([])
  const [total,    setTotal]        = useState(0)
  const [page,     setPage]         = useState(1)
  const [q,        setQ]            = useState('')
  const [filterSt, setFilterSt]     = useState('')
  const [loading,  setLoading]      = useState(true)
  const [selected, setSelected]     = useState<Debtor | null>(null)
  const [detailTab, setDetailTab]   = useState<'info' | 'crm' | 'contact' | 'promises' | 'followup' | 'payment' | 'appt' | 'files'>('info')
  const [summary,  setSummary]      = useState<Summary | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit,   setShowEdit]   = useState(false)
  const [employees, setEmployees]   = useState<User[]>([])

  const loadDebtors = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/debtors?q=${encodeURIComponent(q)}&status=${filterSt}&page=${page}`)
    if (r.ok) { const d = await r.json(); setDebtors(d.items); setTotal(d.total) }
    setLoading(false)
  }, [q, filterSt, page])

  const loadSummary = useCallback(async () => {
    if (!canManage) return
    const r = await fetch('/api/debtors/summary')
    if (r.ok) setSummary(await r.json())
  }, [canManage])

  const loadDetail = useCallback(async (id: string) => {
    const [rDebtor, rContacts, rPromises] = await Promise.all([
      fetch(`/api/debtors/${id}`),
      fetch(`/api/debtors/${id}/contacts`),
      fetch(`/api/debtors/${id}/promises`),
    ])
    if (rDebtor.ok) {
      const d = await rDebtor.json()
      if (rContacts.ok) d.contacts = await rContacts.json()
      if (rPromises.ok) d.promises = await rPromises.json()
      setSelected(d)
    }
  }, [])

  useEffect(() => { loadDebtors() }, [loadDebtors])
  useEffect(() => { if (mainTab === 'dashboard') loadSummary() }, [mainTab, loadSummary])
  useEffect(() => {
    if (canManage) {
      fetch('/api/employees?limit=200').then(r => r.ok ? r.json() : null).then(d => { if (d?.users) setEmployees(d.users) })
    }
  }, [canManage])

  const handleSelectDebtor = (d: Debtor) => { loadDetail(d.id); setDetailTab('info') }

  return (
    <div className="flex flex-col md:h-[calc(100dvh-64px)] md:overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-gray-200 dark:border-white/[0.06] shrink-0 bg-white dark:bg-slate-950/80">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">ลูกหนี้</h1>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Debt Collection CRM</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMainTab('list')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mainTab === 'list' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>รายชื่อลูกหนี้</button>
          {canManage && <button onClick={() => setMainTab('dashboard')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mainTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>Dashboard</button>}
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">+ เพิ่มลูกหนี้</button>
        </div>
      </div>

      {mainTab === 'dashboard' ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <DashboardView summary={summary} />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: list — 35% on desktop */}
          <div className="w-full md:w-[35%] md:max-w-[420px] shrink-0 flex flex-col gap-2.5 border-r border-slate-200 dark:border-white/[0.06] overflow-y-auto p-3">
            {/* Search + filter */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="ค้นหาชื่อ / เบอร์ / เลขคดี…"
                className="w-full h-10 pl-10 pr-3 text-sm rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition" />
            </div>
            <select value={filterSt} onChange={e => { setFilterSt(e.target.value); setPage(1) }}
              className="h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition">
              <option value="">ทุกสถานะ</option>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-[72px] rounded-xl bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
                ))
              ) : debtors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center text-slate-400 dark:text-slate-500">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">ไม่พบลูกหนี้</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">ลองค้นหาด้วยคำอื่น หรือล้างตัวกรอง</p>
                </div>
              ) : debtors.map(d => (
                <button key={d.id} onClick={() => handleSelectDebtor(d)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selected?.id === d.id
                      ? 'border-blue-500/50 bg-blue-50/80 dark:bg-blue-900/20 shadow-sm'
                      : 'border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.03] hover:border-slate-300 dark:hover:border-white/[0.12] hover:bg-slate-50 dark:hover:bg-white/[0.05]'
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{d.debtorNumber}</p>
                      <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">{d.firstName} {d.lastName}</p>
                      {d.phone && <p className="text-[11px] text-slate-500 dark:text-slate-400">{d.phone}</p>}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${STATUS_COLORS[d.status]}`}>{STATUS_LABELS[d.status]}</span>
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px]">
                    <span className="text-slate-400 dark:text-slate-500">คงเหลือ</span>
                    <span className={`font-bold ${d.remainingDebt > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>฿{fmt(d.remainingDebt)}</span>
                  </div>
                  {d.assignedTo && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">ผู้รับผิดชอบ: {d.assignedTo.name}</p>}
                </button>
              ))}
            </div>

            {/* Pagination */}
            {total > 50 && (
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-white/[0.05]">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/[0.08] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition">‹</button>
                <span>{page} / {Math.ceil(total / 50)}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 50)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/[0.08] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition">›</button>
              </div>
            )}
          </div>

          {/* Right: detail — 65% on desktop */}
          <div className="hidden md:flex flex-1 min-w-0 overflow-y-auto">
            {selected ? (
              <DetailPanel
                debtor={selected}
                activeTab={detailTab}
                setActiveTab={setDetailTab}
                userId={userId}
                userRole={userRole}
                employees={employees}
                onRefresh={() => { loadDetail(selected.id); loadDebtors() }}
                onEdit={() => setShowEdit(true)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center">
                  <svg className="w-8 h-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                </div>
                <p className="font-semibold text-slate-600 dark:text-slate-400">เลือกลูกหนี้</p>
                <p className="text-sm text-slate-400 dark:text-slate-500">คลิกรายชื่อทางซ้ายเพื่อดูรายละเอียด</p>
              </div>
            )}
          </div>
          {/* Mobile: show detail as overlay */}
          {selected && (
            <div className="md:hidden fixed inset-0 z-40 bg-black/50 flex flex-col justify-end">
              <div className="bg-white dark:bg-slate-900 rounded-t-2xl max-h-[88vh] overflow-y-auto">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/10 sticky top-0 bg-white dark:bg-slate-900 z-10">
                  <span className="font-semibold text-sm text-gray-900 dark:text-white">{selected.firstName} {selected.lastName}</span>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1">✕</button>
                </div>
                <DetailPanel
                  debtor={selected}
                  activeTab={detailTab}
                  setActiveTab={setDetailTab}
                  userId={userId}
                  userRole={userRole}
                  employees={employees}
                  onRefresh={() => { loadDetail(selected.id); loadDebtors() }}
                  onEdit={() => setShowEdit(true)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <DebtorModal
          mode="create"
          employees={employees}
          userId={userId}
          onClose={() => setShowCreate(false)}
          onSave={() => { setShowCreate(false); loadDebtors() }}
        />
      )}
      {showEdit && selected && (
        <DebtorModal
          mode="edit"
          debtor={selected}
          employees={employees}
          userId={userId}
          onClose={() => setShowEdit(false)}
          onSave={() => { setShowEdit(false); loadDetail(selected.id); loadDebtors() }}
        />
      )}
    </div>
  )
}

// ─── Dashboard view ───────────────────────────────────────────────────────────

function DashboardView({ summary }: { summary: Summary | null }) {
  if (!summary) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>

  const cards = [
    { label: 'ลูกหนี้ทั้งหมด',     value: summary.totalDebtors.toLocaleString(),                      color: 'text-blue-600' },
    { label: 'หนี้รวม',             value: `฿${summary.totalDebt.toLocaleString('th-TH')}`,           color: 'text-gray-700' },
    { label: 'เก็บได้เดือนนี้',      value: `฿${summary.monthCollected.toLocaleString('th-TH')}`,     color: 'text-green-600' },
    { label: 'คงเหลือทั้งหมด',      value: `฿${summary.remainingDebt.toLocaleString('th-TH')}`,      color: 'text-red-600' },
    { label: 'อัตราเก็บหนี้',       value: `${summary.recoveryRate.toFixed(1)}%`,                     color: 'text-purple-600' },
    { label: 'นัดวันนี้ (upcoming)', value: summary.upcomingAppts.toLocaleString(),                   color: 'text-yellow-600' },
    { label: 'ผิดนัด',              value: summary.overdueAppts.toLocaleString(),                     color: 'text-red-600' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">จำแนกตามสถานะ</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STATUSES.map(s => (
            <div key={s} className={`rounded-lg p-2 text-center ${STATUS_COLORS[s]}`}>
              <p className="text-xs">{STATUS_LABELS[s]}</p>
              <p className="text-lg font-bold">{summary.statusMap[s] ?? 0}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top remaining */}
      {summary.topRemaining.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">ลูกหนี้ยอดคงค้างสูงสุด 10 อันดับ</h3>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left py-1">เลข</th>
                <th className="text-left py-1">ชื่อ</th>
                <th className="text-left py-1">สถานะ</th>
                <th className="text-right py-1">ยอดหนี้</th>
                <th className="text-right py-1">คงเหลือ</th>
                <th className="text-left py-1">ผู้รับผิดชอบ</th>
              </tr>
            </thead>
            <tbody>
              {summary.topRemaining.map(d => (
                <tr key={d.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-1.5 font-mono text-xs text-gray-500">{d.debtorNumber}</td>
                  <td className="py-1.5 font-medium">{d.firstName} {d.lastName}</td>
                  <td className="py-1.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[d.status ?? '']}`}>{STATUS_LABELS[d.status ?? ''] ?? d.status}</span></td>
                  <td className="py-1.5 text-right">฿{(d.totalDebt ?? 0).toLocaleString('th-TH')}</td>
                  <td className="py-1.5 text-right text-red-600 font-semibold">฿{(d.remainingDebt ?? 0).toLocaleString('th-TH')}</td>
                  <td className="py-1.5 text-xs text-gray-500">{(d as Debtor).assignedTo?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ debtor, activeTab, setActiveTab, userId, userRole, employees, onRefresh, onEdit }: {
  debtor: Debtor; activeTab: string; setActiveTab: (t: 'info'|'crm'|'contact'|'promises'|'followup'|'payment'|'appt'|'files') => void
  userId: string; userRole: string; employees: User[]
  onRefresh: () => void; onEdit: () => void
}) {
  const tabs: { key: 'info'|'crm'|'contact'|'promises'|'followup'|'payment'|'appt'|'files'; label: string }[] = [
    { key: 'info',     label: 'ข้อมูล' },
    { key: 'crm',      label: 'CRM' },
    { key: 'contact',  label: `ติดต่อ (${debtor.contacts?.length ?? 0})` },
    { key: 'promises', label: `สัญญา (${debtor.promises?.length ?? 0})` },
    { key: 'followup', label: `บันทึก (${debtor._count?.followUps ?? debtor.followUps?.length ?? 0})` },
    { key: 'payment',  label: `ชำระ (${debtor._count?.payments ?? debtor.payments?.length ?? 0})` },
    { key: 'appt',     label: `นัด (${debtor._count?.appointments ?? debtor.appointments?.length ?? 0})` },
    { key: 'files',    label: `ไฟล์ (${debtor.files?.length ?? 0})` },
  ]

  // Recovery progress
  const progress = debtor.totalDebt > 0 ? Math.min(100, (debtor.paidAmount / debtor.totalDebt) * 100) : 0

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 w-full">
      {/* Debtor header */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-200 dark:border-white/[0.06] shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-[10px] text-slate-400 font-mono">{debtor.debtorNumber}</p>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${RISK_COLORS[debtor.riskLevel ?? 'MEDIUM']}`}>
                ความเสี่ยง: {RISK_LABELS[debtor.riskLevel ?? 'MEDIUM']}
              </span>
            </div>
            <h2 className="text-[17px] font-bold text-slate-900 dark:text-white leading-tight">{debtor.firstName} {debtor.lastName}</h2>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {debtor.phone && <p className="text-[12px] text-slate-500 dark:text-slate-400">📱 {debtor.phone}</p>}
              {debtor.phone2 && <p className="text-[12px] text-slate-500 dark:text-slate-400">{debtor.phone2}</p>}
              {debtor.phone3 && <p className="text-[12px] text-slate-500 dark:text-slate-400">{debtor.phone3}</p>}
              {debtor.lineId && <p className="text-[12px] text-slate-500 dark:text-slate-400">LINE: {debtor.lineId}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[debtor.status]}`}>{STATUS_LABELS[debtor.status]}</span>
            <button onClick={onEdit} className="text-xs px-3 py-1.5 border border-slate-200 dark:border-white/[0.1] rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.05] text-slate-700 dark:text-slate-300 transition">แก้ไข</button>
          </div>
        </div>

        {/* Debt progress */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-[10px] text-slate-400">ยอดหนี้รวม</p>
            <p className="text-[13px] font-bold text-slate-800 dark:text-slate-200">฿{fmt(debtor.totalDebt)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-400">ชำระแล้ว</p>
            <p className="text-[13px] font-bold text-green-600">฿{fmt(debtor.paidAmount)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-400">คงเหลือ</p>
            <p className={`text-[13px] font-bold ${debtor.remainingDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>฿{fmt(debtor.remainingDebt)}</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 w-full h-1.5 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progress}%`,
              background: progress >= 100 ? '#22c55e' : progress >= 50 ? '#f59e0b' : '#ef4444',
            }}
          />
        </div>
        <p className="text-right text-[10px] text-slate-400 mt-0.5">{progress.toFixed(0)}% ชำระแล้ว</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-white/[0.06] px-3 overflow-x-auto shrink-0 no-scrollbar">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`text-[12px] px-2.5 py-2.5 whitespace-nowrap border-b-2 transition-colors font-medium ${
              activeTab === t.key
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'info'     && <InfoTab debtor={debtor} employees={employees} />}
        {activeTab === 'crm'      && <CrmTab debtor={debtor} />}
        {activeTab === 'contact'  && <ContactTab debtor={debtor} userId={userId} onRefresh={onRefresh} />}
        {activeTab === 'promises' && <PromisesTab debtor={debtor} userId={userId} onRefresh={onRefresh} />}
        {activeTab === 'followup' && <FollowUpTab debtor={debtor} userId={userId} onRefresh={onRefresh} />}
        {activeTab === 'payment'  && <PaymentTab debtor={debtor} userId={userId} onRefresh={onRefresh} />}
        {activeTab === 'appt'     && <ApptTab debtor={debtor} userId={userId} onRefresh={onRefresh} />}
        {activeTab === 'files'    && <FilesTab debtor={debtor} onRefresh={onRefresh} />}
      </div>
    </div>
  )
}

// ─── Info tab ─────────────────────────────────────────────────────────────────

function InfoTab({ debtor, employees }: { debtor: Debtor; employees: User[] }) {
  const rows = [
    ['เลขบัตรประชาชน', debtor.nationalId],
    ['เบอร์โทร 2',      debtor.phone2],
    ['LINE ID',         debtor.lineId],
    ['Email',           debtor.email],
    ['ที่อยู่',          debtor.address],
    ['จังหวัด',         debtor.province],
    ['เลขคดี',          debtor.caseNumber],
    ['วันที่เริ่ม',      debtor.startDate ? fmtDate(debtor.startDate) : null],
    ['ผู้รับผิดชอบ',     debtor.assignedTo?.name],
    ['ผู้สร้าง',         debtor.createdBy?.name],
  ]
  return (
    <div className="space-y-2">
      {rows.map(([label, val]) => val ? (
        <div key={label as string} className="flex text-sm">
          <span className="w-36 text-gray-500 flex-shrink-0">{label}</span>
          <span className="text-gray-900 dark:text-white">{val}</span>
        </div>
      ) : null)}
      {debtor.note && <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg text-sm text-gray-700 dark:text-gray-300 border border-yellow-100 dark:border-yellow-900/30"><p className="text-xs text-gray-400 mb-1">หมายเหตุ</p>{debtor.note}</div>}
    </div>
  )
}

// ─── CRM tab ─────────────────────────────────────────────────────────────────

function CrmTab({ debtor }: { debtor: Debtor }) {
  const parsedTags: string[] = (() => {
    try { return JSON.parse(debtor.tags || '[]') } catch { return [] }
  })()

  const rows: [string, string | undefined | null][] = [
    ['อาชีพ',             debtor.occupation],
    ['สถานที่ทำงาน',      debtor.workplace],
    ['ที่อยู่ทำงาน',      debtor.workplaceAddress],
    ['ที่อยู่ตามทะเบียน', debtor.registeredAddress],
    ['ที่อยู่ทรัพย์สิน',  debtor.assetAddress],
    ['Facebook',          debtor.facebook],
    ['เบอร์โทร 3',         debtor.phone3],
    ['รายได้ประมาณ',      debtor.incomeEstimate != null ? `฿${debtor.incomeEstimate.toLocaleString('th-TH')}` : null],
    ['ช่วงเวลาติดต่อ',    debtor.preferredContactTime],
    ['วิธีติดต่อที่ต้องการ', debtor.contactPreference ? CHANNEL_LABELS[debtor.contactPreference] ?? debtor.contactPreference : null],
    ['ติดต่อล่าสุด',       debtor.lastContactAt ? fmtDate(debtor.lastContactAt) : null],
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">ระดับความเสี่ยง</span>
        <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${RISK_COLORS[debtor.riskLevel ?? 'MEDIUM']}`}>
          {RISK_LABELS[debtor.riskLevel ?? 'MEDIUM']}
        </span>
      </div>

      {parsedTags.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {parsedTags.map((tag) => (
              <span key={tag} className="text-xs px-2.5 py-1 bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 rounded-full border border-slate-200 dark:border-white/[0.08]">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">ข้อมูล CRM</p>
        {rows.map(([label, val]) => val ? (
          <div key={label} className="flex text-sm">
            <span className="w-40 text-slate-400 dark:text-slate-500 flex-shrink-0 text-[12px]">{label}</span>
            <span className="text-slate-800 dark:text-slate-200 text-[12px]">{val}</span>
          </div>
        ) : null)}
      </div>
    </div>
  )
}

// ─── Contact timeline tab ─────────────────────────────────────────────────────

function ContactTab({ debtor, userId, onRefresh }: { debtor: Debtor; userId: string; onRefresh: () => void }) {
  const [showForm, setShowForm]         = useState(false)
  const [channel, setChannel]           = useState('PHONE')
  const [direction, setDirection]       = useState('OUTBOUND')
  const [result, setResult]             = useState('REACHED')
  const [note, setNote]                 = useState('')
  const [promisedAt, setPromisedAt]     = useState('')
  const [promisedAmount, setPromisedAmt] = useState('')
  const [nextContactAt, setNextContact] = useState('')
  const [saving, setSaving]             = useState(false)
  const [contacts, setContacts]         = useState<DebtorContact[]>(debtor.contacts ?? [])

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch(`/api/debtors/${debtor.id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel, direction, result, note: note || null,
          promisedAt: promisedAt || null,
          promisedAmount: promisedAmount ? Number(promisedAmount) : null,
          nextContactAt: nextContactAt || null,
        }),
      })
      if (r.ok) {
        const c = await r.json()
        setContacts(prev => [c, ...prev])
        setShowForm(false); setNote(''); setPromisedAt(''); setPromisedAmt(''); setNextContact('')
        onRefresh()
      }
    } catch (error) {
      console.error('[SAVE ERROR]', error)
      throw error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setShowForm(!showForm)}
        className="w-full py-2 border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 rounded-lg text-sm hover:bg-blue-50 dark:hover:bg-blue-900/10 transition">
        + บันทึกการติดต่อ
      </button>

      {showForm && (
        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 space-y-3 border border-blue-200 dark:border-blue-800">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">ช่องทาง</label>
              <select value={channel} onChange={e => setChannel(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                {CONTACT_CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">ทิศทาง</label>
              <select value={direction} onChange={e => setDirection(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                <option value="OUTBOUND">โทรออก</option>
                <option value="INBOUND">โทรเข้า</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">ผล</label>
              <select value={result} onChange={e => setResult(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                {CONTACT_RESULTS.map(r => <option key={r} value={r}>{RESULT_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">บันทึก</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white resize-none"
              placeholder="รายละเอียดการสนทนา…" />
          </div>
          {result === 'REACHED' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">สัญญาชำระวันที่</label>
                <input type="datetime-local" value={promisedAt} onChange={e => setPromisedAt(e.target.value)}
                  className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">ยอดสัญญา (บาท)</label>
                <input type="number" value={promisedAmount} onChange={e => setPromisedAmt(e.target.value)}
                  className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" placeholder="0" />
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">ติดต่อครั้งถัดไป</label>
            <input type="datetime-local" value={nextContactAt} onChange={e => setNextContact(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm px-4 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
            <button onClick={save} disabled={saving}
              className="text-sm px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
              {saving ? 'บันทึก…' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {contacts.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">ยังไม่มีบันทึกการติดต่อ</p>
      ) : (
        <div className="space-y-2">
          {contacts.map(c => (
            <div key={c.id} className="rounded-xl border border-slate-200 dark:border-white/[0.07] p-3 bg-white dark:bg-white/[0.02]">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 rounded-full font-medium">
                    {CHANNEL_LABELS[c.channel] ?? c.channel}
                  </span>
                  <span className="text-[10px] text-slate-400">{c.direction === 'OUTBOUND' ? '↗ โทรออก' : '↙ โทรเข้า'}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${RESULT_COLORS[c.result] ?? 'bg-gray-100 text-gray-600'}`}>
                    {RESULT_LABELS[c.result] ?? c.result}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">
                  {new Date(c.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              {c.note && <p className="text-[12px] text-slate-700 dark:text-slate-300 mt-1">{c.note}</p>}
              {c.promisedAt && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                  💰 สัญญาชำระ {fmtDate(c.promisedAt)}{c.promisedAmount ? ` — ฿${fmt(c.promisedAmount)}` : ''}
                </p>
              )}
              {c.nextContactAt && (
                <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5">📅 ติดตามครั้งถัดไป: {fmtDate(c.nextContactAt)}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-1">โดย: {c.performedBy.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Promises tab ─────────────────────────────────────────────────────────────

function PromisesTab({ debtor, userId, onRefresh }: { debtor: Debtor; userId: string; onRefresh: () => void }) {
  const [showForm, setShowForm]     = useState(false)
  const [promisedAmount, setAmount] = useState('')
  const [promisedDate, setDate]     = useState('')
  const [note, setNote]             = useState('')
  const [saving, setSaving]         = useState(false)
  const [promises, setPromises]     = useState<PromiseToPay[]>(debtor.promises ?? [])

  const save = async () => {
    if (!promisedAmount || !promisedDate) return
    setSaving(true)
    try {
      const r = await fetch(`/api/debtors/${debtor.id}/promises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promisedAmount: Number(promisedAmount), promisedDate, note: note || null }),
      })
      if (r.ok) {
        const p = await r.json()
        setPromises(prev => [p, ...prev])
        setShowForm(false); setAmount(''); setDate(''); setNote('')
        onRefresh()
      }
    } catch (error) {
      console.error('[SAVE ERROR]', error)
      throw error
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (promiseId: string, status: string) => {
    await fetch(`/api/debtors/${debtor.id}/promises`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promiseId, status }),
    })
    setPromises(prev => prev.map(p => p.id === promiseId ? { ...p, status } : p))
    onRefresh()
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setShowForm(!showForm)}
        className="w-full py-2 border-2 border-dashed border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 rounded-lg text-sm hover:bg-amber-50 dark:hover:bg-amber-900/10 transition">
        + สร้างสัญญาชำระ
      </button>

      {showForm && (
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-4 space-y-3 border border-amber-200 dark:border-amber-800">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">ยอดที่ตกลง (บาท) *</label>
              <input type="number" value={promisedAmount} onChange={e => setAmount(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">วันที่สัญญา *</label>
              <input type="date" value={promisedDate} onChange={e => setDate(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">หมายเหตุ</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" placeholder="…" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm px-4 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
            <button onClick={save} disabled={saving || !promisedAmount || !promisedDate}
              className="text-sm px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg disabled:opacity-50">
              {saving ? 'บันทึก…' : 'สร้างสัญญา'}
            </button>
          </div>
        </div>
      )}

      {promises.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">ยังไม่มีสัญญาชำระ</p>
      ) : (
        <div className="space-y-2">
          {promises.map(p => (
            <div key={p.id} className="rounded-xl border border-slate-200 dark:border-white/[0.07] p-3 bg-white dark:bg-white/[0.02]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-bold text-amber-600">฿{fmt(p.promisedAmount)}</p>
                  <p className="text-[11px] text-slate-500">ครบกำหนด: {fmtDate(p.promisedDate)}</p>
                  {p.note && <p className="text-[11px] text-slate-400 mt-0.5">{p.note}</p>}
                  <p className="text-[10px] text-slate-400 mt-0.5">สร้างโดย: {p.createdBy.name}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PROMISE_STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {PROMISE_STATUS_LABELS[p.status] ?? p.status}
                  </span>
                  {p.status === 'PENDING' && (
                    <div className="flex gap-1">
                      <button onClick={() => updateStatus(p.id, 'KEPT')}
                        className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200">ชำระแล้ว</button>
                      <button onClick={() => updateStatus(p.id, 'BROKEN')}
                        className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200">ผิดสัญญา</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Follow-up tab ────────────────────────────────────────────────────────────

function FollowUpTab({ debtor, userId, onRefresh }: { debtor: Debtor; userId: string; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [method, setMethod]     = useState(FOLLOW_METHODS[0])
  const [followedAt, setAt]     = useState(new Date().toISOString().slice(0, 16))
  const [result, setResult]     = useState('')
  const [note, setNote]         = useState('')
  const [nextFU, setNextFU]     = useState('')
  const [saving, setSaving]     = useState(false)

  const save = async () => {
    if (!result) return
    setSaving(true)
    try {
      const r = await fetch(`/api/debtors/${debtor.id}/followups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, followedAt, result, note: note || null, nextFollowUp: nextFU || null }),
      })
      if (r.ok) { setShowForm(false); setResult(''); setNote(''); setNextFU(''); onRefresh() }
    } catch (error) {
      console.error('[SAVE ERROR]', error)
      throw error
    } finally {
      setSaving(false)
    }
  }

  const list = debtor.followUps ?? []
  return (
    <div className="space-y-3">
      <button onClick={() => setShowForm(!showForm)} className="w-full py-2 border-2 border-dashed border-blue-300 text-blue-600 rounded-lg text-sm hover:bg-blue-50 dark:hover:bg-blue-900/10">+ บันทึกการติดตาม</button>
      {showForm && (
        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 space-y-3 border border-blue-200 dark:border-blue-800">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ช่องทาง</label>
              <select value={method} onChange={e => setMethod(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                {FOLLOW_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">วันเวลา</label>
              <input type="datetime-local" value={followedAt} onChange={e => setAt(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">ผลการติดตาม *</label>
            <textarea value={result} onChange={e => setResult(e.target.value)} rows={2} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none" placeholder="เช่น โทรแล้วรับสาย รับปากจะชำระ..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
              <input value={note} onChange={e => setNote(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="เพิ่มเติม…" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">นัดติดตามครั้งถัดไป</label>
              <input type="datetime-local" value={nextFU} onChange={e => setNextFU(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">ยกเลิก</button>
            <button onClick={save} disabled={saving || !result} className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          </div>
        </div>
      )}
      {list.length === 0 ? <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีบันทึกการติดตาม</p> : list.map(f => (
        <div key={f.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded text-xs">{f.method}</span>
            <span className="text-xs text-gray-400">{new Date(f.followedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
          <p className="text-gray-800 dark:text-gray-200">{f.result}</p>
          {f.note && <p className="text-gray-500 text-xs mt-1">{f.note}</p>}
          {f.nextFollowUp && <p className="text-xs text-yellow-600 mt-1">📅 ติดตามครั้งถัดไป: {fmtDate(f.nextFollowUp)}</p>}
          <p className="text-xs text-gray-400 mt-1">โดย: {f.performedBy.name}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Payment tab ──────────────────────────────────────────────────────────────

function PaymentTab({ debtor, userId, onRefresh }: { debtor: Debtor; userId: string; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount]     = useState('')
  const [paidAt, setPaidAt]     = useState(new Date().toISOString().slice(0, 10))
  const [channel, setChannel]   = useState('โอนเงิน')
  const [note, setNote]         = useState('')
  const [saving, setSaving]     = useState(false)

  const save = async () => {
    if (!amount) return
    setSaving(true)
    try {
      const r = await fetch(`/api/debtors/${debtor.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), paidAt, channel, note: note || null, receivedById: userId }),
      })
      if (r.ok) { setShowForm(false); setAmount(''); setNote(''); onRefresh() }
    } catch (error) {
      console.error('[SAVE ERROR]', error)
      throw error
    } finally {
      setSaving(false)
    }
  }

  const list = debtor.payments ?? []
  return (
    <div className="space-y-3">
      {debtor.remainingDebt > 0 && (
        <button onClick={() => setShowForm(!showForm)} className="w-full py-2 border-2 border-dashed border-green-300 text-green-600 rounded-lg text-sm hover:bg-green-50 dark:hover:bg-green-900/10">+ บันทึกการชำระ</button>
      )}
      {showForm && (
        <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-4 space-y-3 border border-green-200 dark:border-green-800">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ยอดชำระ (บาท) *</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">วันที่</label>
              <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ช่องทาง</label>
              <select value={channel} onChange={e => setChannel(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                {['โอนเงิน', 'เงินสด', 'เช็ค', 'อื่นๆ'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
            <input value={note} onChange={e => setNote(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="หมายเลขอ้างอิง…" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">ยกเลิก</button>
            <button onClick={save} disabled={saving || !amount} className="text-sm px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50">{saving ? 'กำลังบันทึก…' : 'บันทึกการชำระ'}</button>
          </div>
        </div>
      )}
      {list.length === 0 ? <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีประวัติการชำระ</p> : list.map(p => (
        <div key={p.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-sm flex items-start justify-between">
          <div>
            <p className="font-semibold text-green-600">฿{fmt(p.amount)}</p>
            <p className="text-xs text-gray-500">{fmtDate(p.paidAt)} · {p.channel}</p>
            {p.note && <p className="text-xs text-gray-400">{p.note}</p>}
            <p className="text-xs text-gray-400">รับโดย: {p.receivedBy?.name ?? p.createdBy.name}</p>
          </div>
        </div>
      ))}
      {list.length > 0 && (
        <div className="text-xs text-gray-500 text-right">รวมชำระ: ฿{fmt(list.reduce((s, p) => s + p.amount, 0))}</div>
      )}
    </div>
  )
}

// ─── Appointment tab ──────────────────────────────────────────────────────────

function ApptTab({ debtor, userId, onRefresh }: { debtor: Debtor; userId: string; onRefresh: () => void }) {
  const [showForm, setShowForm]     = useState(false)
  const [appointDate, setApptDate]  = useState('')
  const [agreedAmount, setAgreed]   = useState('')
  const [location, setLocation]     = useState('')
  const [note, setNote]             = useState('')
  const [saving, setSaving]         = useState(false)

  const save = async () => {
    if (!appointDate) return
    setSaving(true)
    try {
      const r = await fetch(`/api/debtors/${debtor.id}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointDate, agreedAmount: Number(agreedAmount || 0), location: location || null, note: note || null }),
      })
      if (r.ok) { setShowForm(false); setApptDate(''); setAgreed(''); setLocation(''); setNote(''); onRefresh() }
    } catch (error) {
      console.error('[SAVE ERROR]', error)
      throw error
    } finally {
      setSaving(false)
    }
  }

  const updateApptStatus = async (apptId: string, status: string) => {
    await fetch(`/api/payment-appointments/${apptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    onRefresh()
  }

  const list = debtor.appointments ?? []
  return (
    <div className="space-y-3">
      <button onClick={() => setShowForm(!showForm)} className="w-full py-2 border-2 border-dashed border-yellow-300 text-yellow-600 rounded-lg text-sm hover:bg-yellow-50 dark:hover:bg-yellow-900/10">+ สร้างนัดชำระ</button>
      {showForm && (
        <div className="bg-yellow-50 dark:bg-yellow-900/10 rounded-xl p-4 space-y-3 border border-yellow-200 dark:border-yellow-800">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">วันเวลานัด *</label>
              <input type="datetime-local" value={appointDate} onChange={e => setApptDate(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ยอดตกลงชำระ (บาท)</label>
              <input type="number" value={agreedAmount} onChange={e => setAgreed(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">สถานที่</label>
              <input value={location} onChange={e => setLocation(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="สาขา / ออนไลน์…" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
              <input value={note} onChange={e => setNote(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="…" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">ยกเลิก</button>
            <button onClick={save} disabled={saving || !appointDate} className="text-sm px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg disabled:opacity-50">{saving ? 'กำลังบันทึก…' : 'สร้างนัด'}</button>
          </div>
        </div>
      )}
      {list.length === 0 ? <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีนัดชำระ</p> : list.map(a => (
        <div key={a.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium">{new Date(a.appointDate).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              <p className="text-green-600 font-semibold">฿{fmt(a.agreedAmount)}</p>
              {a.location && <p className="text-xs text-gray-500">📍 {a.location}</p>}
              {a.note && <p className="text-xs text-gray-400">{a.note}</p>}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${APPT_COLORS[a.status]}`}>{APPT_LABELS[a.status]}</span>
              {a.status === 'PENDING' && (
                <div className="flex gap-1 mt-1">
                  <button onClick={() => updateApptStatus(a.id, 'KEPT')} className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200">ชำระแล้ว</button>
                  <button onClick={() => updateApptStatus(a.id, 'MISSED')} className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200">ผิดนัด</button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Files tab ────────────────────────────────────────────────────────────────

function FilesTab({ debtor, onRefresh }: { debtor: Debtor; onRefresh: () => void }) {
  const fileRef   = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState('OTHER')
  const [uploading, setUploading] = useState(false)

  const DOC_TYPES = ['สัญญา', 'เอกสารหนี้', 'สลิปชำระ', 'เอกสารคดี', 'อื่นๆ']
  const docTypeMap: Record<string, string> = { OTHER: 'อื่นๆ', สัญญา: 'สัญญา', เอกสารหนี้: 'เอกสารหนี้', สลิปชำระ: 'สลิปชำระ', เอกสารคดี: 'เอกสารคดี' }

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('docType', docType)
      const r = await fetch(`/api/debtors/${debtor.id}/files`, { method: 'POST', body: fd })
      if (r.ok) onRefresh()
    } catch (error) {
      console.error('[SAVE ERROR]', error)
      throw error
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const deleteFile = async (fileId: string) => {
    if (!confirm('ลบไฟล์นี้?')) return
    await fetch(`/api/debtors/${debtor.id}/files`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId }),
    })
    onRefresh()
  }

  const list = debtor.files ?? []
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select value={docType} onChange={e => setDocType(e.target.value)} className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300">
          {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex-1 py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700/30 disabled:opacity-50">
          {uploading ? 'กำลังอัพโหลด…' : '+ อัพโหลดไฟล์'}
        </button>
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={upload} />
      </div>
      {list.length === 0 ? <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีไฟล์</p> : list.map(f => (
        <div key={f.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-sm">
          <div className="flex-1 min-w-0">
            <a href={f.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline truncate block">{f.filename}</a>
            <p className="text-xs text-gray-400">{docTypeMap[f.docType] ?? f.docType} · {(f.size / 1024).toFixed(1)} KB · {fmtDate(f.createdAt)}</p>
          </div>
          <button onClick={() => deleteFile(f.id)} className="ml-2 text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50">ลบ</button>
        </div>
      ))}
    </div>
  )
}

// ─── Create / Edit modal ──────────────────────────────────────────────────────

function DebtorModal({ mode, debtor, employees, userId, onClose, onSave }: {
  mode: 'create' | 'edit'; debtor?: Debtor; employees: User[]
  userId: string; onClose: () => void; onSave: () => void
}) {
  const [activeSection, setActiveSection] = useState<'basic'|'crm'>('basic')
  const [form, setForm] = useState({
    firstName:   debtor?.firstName   ?? '',
    lastName:    debtor?.lastName    ?? '',
    caseNumber:  debtor?.caseNumber  ?? '',
    nationalId:  debtor?.nationalId  ?? '',
    phone:       debtor?.phone       ?? '',
    phone2:      debtor?.phone2      ?? '',
    phone3:      debtor?.phone3      ?? '',
    lineId:      debtor?.lineId      ?? '',
    email:       debtor?.email       ?? '',
    facebook:    debtor?.facebook    ?? '',
    address:     debtor?.address     ?? '',
    province:    debtor?.province    ?? '',
    workplace:   debtor?.workplace   ?? '',
    occupation:  debtor?.occupation  ?? '',
    incomeEstimate: debtor?.incomeEstimate != null ? String(debtor.incomeEstimate) : '',
    riskLevel:   debtor?.riskLevel   ?? 'MEDIUM',
    preferredContactTime: debtor?.preferredContactTime ?? '',
    contactPreference: debtor?.contactPreference ?? '',
    tags:        (() => { try { return JSON.parse(debtor?.tags ?? '[]').join(', ') } catch { return '' } })(),
    workplaceAddress:   debtor?.workplaceAddress   ?? '',
    registeredAddress:  debtor?.registeredAddress  ?? '',
    assetAddress:       debtor?.assetAddress       ?? '',
    assignedToId: debtor?.assignedToId ?? '',
    status:      debtor?.status      ?? 'NEW',
    totalDebt:   String(debtor?.totalDebt ?? ''),
    startDate:   debtor?.startDate ? debtor.startDate.slice(0, 10) : '',
    note:        debtor?.note        ?? '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.firstName || !form.lastName) return
    setSaving(true)
    const url    = mode === 'create' ? '/api/debtors' : `/api/debtors/${debtor!.id}`
    const method = mode === 'create' ? 'POST'        : 'PATCH'
    const tags = form.tags ? JSON.stringify(form.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)) : '[]'
    const body = {
      ...form,
      totalDebt: Number(form.totalDebt || 0),
      assignedToId: form.assignedToId || null,
      startDate: form.startDate || null,
      incomeEstimate: form.incomeEstimate ? Number(form.incomeEstimate) : null,
      tags,
      phone3: form.phone3 || null,
      facebook: form.facebook || null,
      workplace: form.workplace || null,
      occupation: form.occupation || null,
      preferredContactTime: form.preferredContactTime || null,
      contactPreference: form.contactPreference || null,
      workplaceAddress: form.workplaceAddress || null,
      registeredAddress: form.registeredAddress || null,
      assetAddress: form.assetAddress || null,
    }
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.ok) onSave()
    } catch (error) {
      console.error('[SAVE ERROR]', error)
      throw error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{mode === 'create' ? 'เพิ่มลูกหนี้ใหม่' : 'แก้ไขข้อมูลลูกหนี้'}</h2>
          </div>
          {/* Section tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
            {([['basic', 'ข้อมูลพื้นฐาน'], ['crm', 'ข้อมูล CRM']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setActiveSection(key)}
                className={`text-sm px-4 py-2.5 border-b-2 transition-colors font-medium ${activeSection === key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>

          {activeSection === 'basic' && (
            <div className="p-6 grid grid-cols-2 gap-4">
              {[
                { key: 'firstName',  label: 'ชื่อ *',         placeholder: 'ชื่อ',         half: true },
                { key: 'lastName',   label: 'นามสกุล *',      placeholder: 'นามสกุล',      half: true },
                { key: 'nationalId', label: 'เลขบัตรประชาชน', placeholder: '13 หลัก',      half: true },
                { key: 'phone',      label: 'เบอร์โทร',        placeholder: '08x-xxx-xxxx', half: true },
                { key: 'phone2',     label: 'เบอร์โทร 2',      placeholder: '(สำรอง)',      half: true },
                { key: 'phone3',     label: 'เบอร์โทร 3',      placeholder: '(สำรอง)',      half: true },
                { key: 'lineId',     label: 'LINE ID',         placeholder: '@lineid',      half: true },
                { key: 'email',      label: 'Email',           placeholder: 'email@example.com', half: true },
                { key: 'caseNumber', label: 'เลขคดี',          placeholder: 'เช่น 001/2567', half: true },
                { key: 'address',    label: 'ที่อยู่',          placeholder: 'บ้านเลขที่ ถนน…', half: false },
                { key: 'province',   label: 'จังหวัด',         placeholder: 'กรุงเทพฯ',    half: true },
                { key: 'totalDebt',  label: 'ยอดหนี้รวม (บาท)', placeholder: '0',           half: true },
                { key: 'startDate',  label: 'วันที่เริ่ม',      placeholder: '',             half: true, type: 'date' as const },
              ].map(f => (
                <div key={f.key} className={f.half ? '' : 'col-span-2'}>
                  <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                  <input type={f.type ?? 'text'} value={form[f.key as keyof typeof form]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder}
                    className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400" />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">สถานะ</label>
                <select value={form.status} onChange={e => set('status', e.target.value)}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ผู้รับผิดชอบ</label>
                <select value={form.assignedToId} onChange={e => set('assignedToId', e.target.value)}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="">— ยังไม่กำหนด —</option>
                  {employees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
                <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none" placeholder="หมายเหตุ…" />
              </div>
            </div>
          )}

          {activeSection === 'crm' && (
            <div className="p-6 grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ระดับความเสี่ยง</label>
                <select value={form.riskLevel} onChange={e => set('riskLevel', e.target.value)}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  {RISK_LEVELS.map(r => <option key={r} value={r}>{RISK_LABELS[r]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">วิธีติดต่อที่ต้องการ</label>
                <select value={form.contactPreference} onChange={e => set('contactPreference', e.target.value)}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="">— ไม่ระบุ —</option>
                  {CONTACT_CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">อาชีพ</label>
                <input value={form.occupation} onChange={e => set('occupation', e.target.value)} placeholder="เช่น พนักงาน / ค้าขาย"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">รายได้ประมาณ (บาท/เดือน)</label>
                <input type="number" value={form.incomeEstimate} onChange={e => set('incomeEstimate', e.target.value)} placeholder="0"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">สถานที่ทำงาน</label>
                <input value={form.workplace} onChange={e => set('workplace', e.target.value)} placeholder="บริษัท / สถานที่"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Facebook</label>
                <input value={form.facebook} onChange={e => set('facebook', e.target.value)} placeholder="ชื่อ FB หรือลิงก์"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ช่วงเวลาติดต่อ</label>
                <select value={form.preferredContactTime} onChange={e => set('preferredContactTime', e.target.value)}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="">— ไม่ระบุ —</option>
                  <option value="MORNING">เช้า (08:00-12:00)</option>
                  <option value="AFTERNOON">บ่าย (12:00-17:00)</option>
                  <option value="EVENING">เย็น (17:00-20:00)</option>
                  <option value="ANYTIME">ได้ทุกเวลา</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tags (คั่นด้วยคอมมา)</label>
                <input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="เช่น VIP, ผ่อนชำระ, ติดต่อยาก"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">ที่อยู่ทำงาน</label>
                <input value={form.workplaceAddress} onChange={e => set('workplaceAddress', e.target.value)} placeholder="ที่อยู่สถานที่ทำงาน"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">ที่อยู่ตามทะเบียนบ้าน</label>
                <input value={form.registeredAddress} onChange={e => set('registeredAddress', e.target.value)} placeholder="ที่อยู่ตามทะเบียน"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">ที่อยู่ทรัพย์สิน</label>
                <input value={form.assetAddress} onChange={e => set('assetAddress', e.target.value)} placeholder="บ้าน / ที่ดิน / ยานพาหนะ"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
            </div>
          )}
          <div className="p-6 pt-0 flex gap-3 justify-end">
            <button onClick={onClose} className="px-5 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-700">ยกเลิก</button>
            <button onClick={save} disabled={saving || !form.firstName || !form.lastName} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm disabled:opacity-50">{saving ? 'กำลังบันทึก…' : mode === 'create' ? 'เพิ่มลูกหนี้' : 'บันทึก'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
