'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface User { id: string; name: string; department: string | null; role: string }

interface Debtor {
  id: string; debtorNumber: string; caseNumber?: string; firstName: string; lastName: string
  nationalId?: string; phone?: string; phone2?: string; lineId?: string; email?: string
  address?: string; province?: string; assignedToId?: string; status: string
  totalDebt: number; paidAmount: number; remainingDebt: number; startDate?: string
  note?: string; createdAt: string; updatedAt: string
  assignedTo?: User; createdBy: User
  _count?: { followUps: number; payments: number; appointments: number }
  followUps?: FollowUp[]; payments?: Payment[]; appointments?: Appointment[]; files?: DebtorFile[]
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

interface Summary {
  totalDebtors: number; statusMap: Record<string, number>
  totalDebt: number; paidAmount: number; remainingDebt: number
  monthCollected: number; upcomingAppts: number; overdueAppts: number
  recoveryRate: number; topRemaining: Partial<Debtor>[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

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
  const [detailTab, setDetailTab]   = useState<'info' | 'followup' | 'payment' | 'appt' | 'files'>('info')
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
    const r = await fetch(`/api/debtors/${id}`)
    if (r.ok) { const d = await r.json(); setSelected(d) }
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ลูกหนี้</h1>
          <p className="text-sm text-gray-500 mt-0.5">Debt Collection CRM</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMainTab('list')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mainTab === 'list' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>รายชื่อลูกหนี้</button>
          {canManage && <button onClick={() => setMainTab('dashboard')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mainTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>Dashboard</button>}
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">+ เพิ่มลูกหนี้</button>
        </div>
      </div>

      {mainTab === 'dashboard' ? (
        <DashboardView summary={summary} />
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Left: list */}
          <div className="w-80 flex-shrink-0 flex flex-col gap-3">
            {/* Search + filter */}
            <div className="flex gap-2">
              <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="ค้นหาชื่อ/เบอร์/เลขคดี…" className="flex-1 text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <select value={filterSt} onChange={e => { setFilterSt(e.target.value); setPage(1) }} className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              <option value="">ทุกสถานะ</option>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {loading ? (
                <div className="text-center py-8 text-gray-400 text-sm">กำลังโหลด…</div>
              ) : debtors.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">ไม่มีข้อมูล</div>
              ) : debtors.map(d => (
                <button key={d.id} onClick={() => handleSelectDebtor(d)} className={`w-full text-left p-3 rounded-xl border transition-all ${selected?.id === d.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400 font-mono">{d.debtorNumber}</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{d.firstName} {d.lastName}</p>
                      {d.phone && <p className="text-xs text-gray-500">{d.phone}</p>}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${STATUS_COLORS[d.status]}`}>{STATUS_LABELS[d.status]}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="text-gray-500">คงเหลือ</span>
                    <span className={`font-semibold ${d.remainingDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>฿{fmt(d.remainingDebt)}</span>
                  </div>
                  {d.assignedTo && <p className="text-xs text-gray-400 mt-1">ผู้รับผิดชอบ: {d.assignedTo.name}</p>}
                </button>
              ))}
            </div>

            {/* Pagination */}
            {total > 50 && (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded border disabled:opacity-40">‹</button>
                <span>{page} / {Math.ceil(total / 50)}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 50)} className="px-2 py-1 rounded border disabled:opacity-40">›</button>
              </div>
            )}
          </div>

          {/* Right: detail */}
          <div className="flex-1 min-w-0">
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
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <div className="text-5xl mb-3">📋</div>
                  <p className="text-sm">เลือกลูกหนี้เพื่อดูรายละเอียด</p>
                </div>
              </div>
            )}
          </div>
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
          <table className="w-full text-sm">
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
      )}
    </div>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ debtor, activeTab, setActiveTab, userId, userRole, employees, onRefresh, onEdit }: {
  debtor: Debtor; activeTab: string; setActiveTab: (t: 'info'|'followup'|'payment'|'appt'|'files') => void
  userId: string; userRole: string; employees: User[]
  onRefresh: () => void; onEdit: () => void
}) {
  const tabs: { key: 'info'|'followup'|'payment'|'appt'|'files'; label: string }[] = [
    { key: 'info',    label: 'ข้อมูล' },
    { key: 'followup',label: `ติดตาม (${debtor._count?.followUps ?? debtor.followUps?.length ?? 0})` },
    { key: 'payment', label: `ชำระ (${debtor._count?.payments ?? debtor.payments?.length ?? 0})` },
    { key: 'appt',    label: `นัด (${debtor._count?.appointments ?? debtor.appointments?.length ?? 0})` },
    { key: 'files',   label: `ไฟล์ (${debtor.files?.length ?? 0})` },
  ]

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Debtor header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 font-mono">{debtor.debtorNumber}</p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{debtor.firstName} {debtor.lastName}</h2>
            {debtor.phone && <p className="text-sm text-gray-500">📱 {debtor.phone}{debtor.phone2 ? ` / ${debtor.phone2}` : ''}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[debtor.status]}`}>{STATUS_LABELS[debtor.status]}</span>
            <button onClick={onEdit} className="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">แก้ไข</button>
          </div>
        </div>
        {/* Debt amounts */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="text-center"><p className="text-xs text-gray-400">ยอดหนี้รวม</p><p className="text-sm font-bold text-gray-900 dark:text-white">฿{fmt(debtor.totalDebt)}</p></div>
          <div className="text-center"><p className="text-xs text-gray-400">ชำระแล้ว</p><p className="text-sm font-bold text-green-600">฿{fmt(debtor.paidAmount)}</p></div>
          <div className="text-center"><p className="text-xs text-gray-400">คงเหลือ</p><p className={`text-sm font-bold ${debtor.remainingDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>฿{fmt(debtor.remainingDebt)}</p></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 px-4 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className={`text-sm px-3 py-2.5 whitespace-nowrap border-b-2 transition-colors ${activeTab === t.key ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'info'    && <InfoTab debtor={debtor} employees={employees} />}
        {activeTab === 'followup'&& <FollowUpTab debtor={debtor} userId={userId} onRefresh={onRefresh} />}
        {activeTab === 'payment' && <PaymentTab debtor={debtor} userId={userId} onRefresh={onRefresh} />}
        {activeTab === 'appt'    && <ApptTab debtor={debtor} userId={userId} onRefresh={onRefresh} />}
        {activeTab === 'files'   && <FilesTab debtor={debtor} onRefresh={onRefresh} />}
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
    const r = await fetch(`/api/debtors/${debtor.id}/followups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, followedAt, result, note: note || null, nextFollowUp: nextFU || null }),
    })
    setSaving(false)
    if (r.ok) { setShowForm(false); setResult(''); setNote(''); setNextFU(''); onRefresh() }
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
    const r = await fetch(`/api/debtors/${debtor.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(amount), paidAt, channel, note: note || null, receivedById: userId }),
    })
    setSaving(false)
    if (r.ok) { setShowForm(false); setAmount(''); setNote(''); onRefresh() }
  }

  const list = debtor.payments ?? []
  return (
    <div className="space-y-3">
      {debtor.remainingDebt > 0 && (
        <button onClick={() => setShowForm(!showForm)} className="w-full py-2 border-2 border-dashed border-green-300 text-green-600 rounded-lg text-sm hover:bg-green-50 dark:hover:bg-green-900/10">+ บันทึกการชำระ</button>
      )}
      {showForm && (
        <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-4 space-y-3 border border-green-200 dark:border-green-800">
          <div className="grid grid-cols-3 gap-3">
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
    const r = await fetch(`/api/debtors/${debtor.id}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointDate, agreedAmount: Number(agreedAmount || 0), location: location || null, note: note || null }),
    })
    setSaving(false)
    if (r.ok) { setShowForm(false); setApptDate(''); setAgreed(''); setLocation(''); setNote(''); onRefresh() }
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
    const fd = new FormData()
    fd.append('file', file)
    fd.append('docType', docType)
    const r = await fetch(`/api/debtors/${debtor.id}/files`, { method: 'POST', body: fd })
    setUploading(false)
    e.target.value = ''
    if (r.ok) onRefresh()
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
  const [form, setForm] = useState({
    firstName:   debtor?.firstName   ?? '',
    lastName:    debtor?.lastName    ?? '',
    caseNumber:  debtor?.caseNumber  ?? '',
    nationalId:  debtor?.nationalId  ?? '',
    phone:       debtor?.phone       ?? '',
    phone2:      debtor?.phone2      ?? '',
    lineId:      debtor?.lineId      ?? '',
    email:       debtor?.email       ?? '',
    address:     debtor?.address     ?? '',
    province:    debtor?.province    ?? '',
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
    const body   = { ...form, totalDebt: Number(form.totalDebt || 0), assignedToId: form.assignedToId || null, startDate: form.startDate || null }
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (r.ok) onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{mode === 'create' ? 'เพิ่มลูกหนี้ใหม่' : 'แก้ไขข้อมูลลูกหนี้'}</h2>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            {[
              { key: 'firstName',  label: 'ชื่อ *',         placeholder: 'ชื่อ',    half: true },
              { key: 'lastName',   label: 'นามสกุล *',      placeholder: 'นามสกุล', half: true },
              { key: 'nationalId', label: 'เลขบัตรประชาชน', placeholder: '13 หลัก', half: true },
              { key: 'phone',      label: 'เบอร์โทร',        placeholder: '08x-xxx-xxxx', half: true },
              { key: 'phone2',     label: 'เบอร์โทร 2',      placeholder: '(สำรอง)', half: true },
              { key: 'lineId',     label: 'LINE ID',         placeholder: '@lineid', half: true },
              { key: 'email',      label: 'Email',           placeholder: 'email@example.com', half: true },
              { key: 'caseNumber', label: 'เลขคดี',          placeholder: 'เช่น 001/2567', half: true },
              { key: 'address',    label: 'ที่อยู่',          placeholder: 'บ้านเลขที่ ถนน…', half: false },
              { key: 'province',   label: 'จังหวัด',         placeholder: 'กรุงเทพฯ', half: true },
              { key: 'totalDebt',  label: 'ยอดหนี้รวม (บาท)',placeholder: '0', half: true },
              { key: 'startDate',  label: 'วันที่เริ่ม',      placeholder: '', half: true, type: 'date' },
            ].map(f => (
              <div key={f.key} className={f.half ? '' : 'col-span-2'}>
                <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                <input type={f.type ?? 'text'} value={form[f.key as keyof typeof form]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400" />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">สถานะ</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ผู้รับผิดชอบ</label>
              <select value={form.assignedToId} onChange={e => set('assignedToId', e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <option value="">— ยังไม่กำหนด —</option>
                {employees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
              <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none" placeholder="หมายเหตุ…" />
            </div>
          </div>
          <div className="p-6 pt-0 flex gap-3 justify-end">
            <button onClick={onClose} className="px-5 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-700">ยกเลิก</button>
            <button onClick={save} disabled={saving || !form.firstName || !form.lastName} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm disabled:opacity-50">{saving ? 'กำลังบันทึก…' : mode === 'create' ? 'เพิ่มลูกหนี้' : 'บันทึก'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
