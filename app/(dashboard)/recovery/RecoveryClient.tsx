'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface User { id: string; name: string; department: string | null; role: string }
interface DebtorRef { id: string; debtorNumber: string; firstName: string; lastName: string }

interface RecoveryPayment {
  id: string; caseId?: string; debtorId: string; clientId?: string; promiseId?: string
  paymentType: string; amount: number; paymentDate: string; paymentMethod: string
  referenceNumber?: string; proofUrl?: string; collectorId: string
  status: string; note?: string; createdAt: string
  debtor: DebtorRef; collector: User; createdBy?: User
  promise?: { id: string; promisedAmount: number; promisedDate: string; status: string }
  case?: { id: string; caseNumber: string; caseTitle: string }
}

interface DashboardData {
  kpi: { today: number; week: number; month: number; prevMonth: number; allTime: number; monthGrowth: number | null }
  counts: { total: number; pending: number; confirmed: number; rejected: number }
  byType: { type: string; amount: number; count: number }[]
  byMethod: { method: string; amount: number; count: number }[]
  leaderboard: { collectorId: string; name: string; department: string; amount: number; count: number }[]
  recentPayments: RecoveryPayment[]
  topDebtors: { debtorId: string; debtorNumber: string; firstName: string; lastName: string; paidThisMonth: number; remainingDebt: number }[]
  alerts: { overduePromises: { id: string; debtorId: string; debtorName: string; debtorNumber: string; promisedAmount: number; promisedDate: string; daysOverdue: number }[] }
}

interface Debtor { id: string; debtorNumber: string; firstName: string; lastName: string; remainingDebt: number }
interface Employee { id: string; name: string; department: string | null }

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_TYPES = ['FULL_PAYMENT', 'PARTIAL_PAYMENT', 'INSTALLMENT', 'SETTLEMENT', 'COURT_PAYMENT', 'ENFORCEMENT_PAYMENT', 'OTHER']
const TYPE_LABELS: Record<string, string> = {
  FULL_PAYMENT: 'ชำระเต็ม', PARTIAL_PAYMENT: 'ชำระบางส่วน', INSTALLMENT: 'ผ่อนชำระ',
  SETTLEMENT: 'ตกลงประนอม', COURT_PAYMENT: 'ชำระตามคำสั่งศาล', ENFORCEMENT_PAYMENT: 'ชำระตามบังคับคดี', OTHER: 'อื่นๆ',
}
const PAYMENT_METHODS = ['BANK_TRANSFER', 'QR', 'CASH', 'CHEQUE', 'OTHER']
const METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'โอนเงิน', QR: 'QR Code', CASH: 'เงินสด', CHEQUE: 'เช็ค', OTHER: 'อื่นๆ',
}
const STATUS_COLORS: Record<string, string> = {
  PENDING:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  CONFIRMED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  REJECTED:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  REFUNDED:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'รออนุมัติ', CONFIRMED: 'ยืนยันแล้ว', REJECTED: 'ปฏิเสธ', REFUNDED: 'คืนเงิน',
}

const CAN_CONFIRM = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
const fmt  = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0 })
const fmtD = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtDT = (d: string) => new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RecoveryClient({ userId, userRole, userName }: {
  userId: string; userRole: string; userName: string
}) {
  const canConfirm = CAN_CONFIRM.includes(userRole)
  const [view,        setView]       = useState<'payments' | 'dashboard'>('payments')
  const [payments,    setPayments]   = useState<RecoveryPayment[]>([])
  const [total,       setTotal]      = useState(0)
  const [page,        setPage]       = useState(1)
  const [loading,     setLoading]    = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [dashboard,   setDashboard]  = useState<DashboardData | null>(null)
  const [showCreate,  setShowCreate] = useState(false)
  const [selected,    setSelected]   = useState<RecoveryPayment | null>(null)
  const [employees,   setEmployees]  = useState<Employee[]>([])
  const [debtors,     setDebtors]    = useState<Debtor[]>([])
  const [uploading,   setUploading]  = useState(false)

  const loadPayments = useCallback(async () => {
    setLoading(true)
    const s = filterStatus ? `&status=${filterStatus}` : ''
    const r = await fetch(`/api/recovery/payments?page=${page}${s}`)
    if (r.ok) { const d = await r.json(); setPayments(d.items); setTotal(d.total) }
    setLoading(false)
  }, [page, filterStatus])

  const loadDashboard = useCallback(async () => {
    const r = await fetch('/api/recovery/dashboard')
    if (r.ok) setDashboard(await r.json())
  }, [])

  useEffect(() => { if (view === 'payments') loadPayments() }, [view, loadPayments])
  useEffect(() => { if (view === 'dashboard') loadDashboard() }, [view, loadDashboard])

  useEffect(() => {
    if (canConfirm) {
      fetch('/api/employees?limit=200').then(r => r.ok ? r.json() : null).then(d => { if (d?.users) setEmployees(d.users) })
    }
    fetch('/api/debtors?limit=200').then(r => r.ok ? r.json() : null).then(d => { if (d?.items) setDebtors(d.items) })
  }, [canConfirm])

  const confirmPayment = async (paymentId: string) => {
    const r = await fetch(`/api/recovery/payments/${paymentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONFIRMED' }),
    })
    if (r.ok) { loadPayments(); if (selected?.id === paymentId) { const d = await r.json(); setSelected({ ...selected, ...d }) } }
  }

  const rejectPayment = async (paymentId: string) => {
    if (!confirm('ปฏิเสธรายการนี้?')) return
    const r = await fetch(`/api/recovery/payments/${paymentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'REJECTED' }),
    })
    if (r.ok) { loadPayments(); if (selected?.id === paymentId) setSelected(prev => prev ? { ...prev, status: 'REJECTED' } : null) }
  }

  const uploadProof = async (paymentId: string, file: File) => {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch(`/api/recovery/payments/${paymentId}/proof`, { method: 'POST', body: fd })
    setUploading(false)
    if (r.ok) { const d = await r.json(); setSelected(prev => prev ? { ...prev, proofUrl: d.proofUrl } : null); loadPayments() }
  }

  return (
    <div className="flex flex-col md:h-[calc(100dvh-64px)] md:overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-200 dark:border-white/[0.06] shrink-0 bg-white dark:bg-slate-950/80">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">Recovery & Collection</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ติดตามการชำระหนี้ / ผลการเก็บเงิน</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('payments')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'payments' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}>
            รายการชำระ
          </button>
          {canConfirm && (
            <button onClick={() => setView('dashboard')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}>
              Dashboard
            </button>
          )}
          <button onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
            + บันทึกการชำระ
          </button>
        </div>
      </div>

      {view === 'dashboard' ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {dashboard ? <DashboardView data={dashboard} onConfirm={confirmPayment} /> : (
            <div className="flex items-center justify-center h-32 text-slate-400">กำลังโหลด…</div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: payment list */}
          <div className="w-full md:w-[40%] md:max-w-[480px] shrink-0 flex flex-col gap-2 border-r border-slate-200 dark:border-white/[0.06] overflow-y-auto p-3">
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
              className="h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition">
              <option value="">ทุกสถานะ</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>

            <div className="space-y-1.5">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-[88px] rounded-xl bg-slate-100 dark:bg-white/[0.04] animate-pulse" />
                ))
              ) : payments.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-slate-500 text-sm font-medium">ไม่มีรายการ</p>
                  <p className="text-slate-400 text-xs mt-1">ลองเปลี่ยนตัวกรอง</p>
                </div>
              ) : payments.map(p => (
                <button key={p.id} onClick={() => setSelected(p)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selected?.id === p.id
                      ? 'border-blue-500/50 bg-blue-50/80 dark:bg-blue-900/20'
                      : 'border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.03] hover:border-slate-300 dark:hover:border-white/[0.12]'
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-400 font-mono">{p.debtor.debtorNumber}</p>
                      <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {p.debtor.firstName} {p.debtor.lastName}
                      </p>
                      <p className="text-[11px] text-slate-500">{TYPE_LABELS[p.paymentType] ?? p.paymentType} · {METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <p className="text-[14px] font-bold text-green-600">฿{fmt(p.amount)}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400">
                    <span>{fmtD(p.paymentDate)}</span>
                    <span>ผู้รับ: {p.collector.name}</span>
                  </div>
                </button>
              ))}
            </div>

            {total > 30 && (
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-white/[0.05]">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/[0.08] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition">‹</button>
                <span>{page} / {Math.ceil(total / 30)}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 30)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/[0.08] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition">›</button>
              </div>
            )}
          </div>

          {/* Right: detail panel */}
          <div className="hidden md:flex flex-1 min-w-0 overflow-y-auto">
            {selected ? (
              <PaymentDetail
                payment={selected}
                userId={userId}
                userRole={userRole}
                canConfirm={canConfirm}
                uploading={uploading}
                onConfirm={() => confirmPayment(selected.id)}
                onReject={() => rejectPayment(selected.id)}
                onUploadProof={(file) => uploadProof(selected.id, file)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center">
                  <svg className="w-8 h-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="font-semibold text-slate-600 dark:text-slate-400">เลือกรายการชำระ</p>
                <p className="text-sm text-slate-400">คลิกรายการทางซ้ายเพื่อดูรายละเอียด</p>
              </div>
            )}
          </div>

          {/* Mobile overlay */}
          {selected && (
            <div className="md:hidden fixed inset-0 z-40 bg-black/50 flex flex-col justify-end">
              <div className="bg-white dark:bg-slate-900 rounded-t-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10 sticky top-0 bg-white dark:bg-slate-900 z-10">
                  <span className="font-semibold text-sm">รายละเอียดการชำระ</span>
                  <button type="button" onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
                </div>
                <PaymentDetail
                  payment={selected}
                  userId={userId}
                  userRole={userRole}
                  canConfirm={canConfirm}
                  uploading={uploading}
                  onConfirm={() => confirmPayment(selected.id)}
                  onReject={() => rejectPayment(selected.id)}
                  onUploadProof={(file) => uploadProof(selected.id, file)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreatePaymentModal
          userId={userId}
          userRole={userRole}
          employees={employees}
          debtors={debtors}
          canConfirm={canConfirm}
          onClose={() => setShowCreate(false)}
          onSave={() => { setShowCreate(false); loadPayments() }}
        />
      )}
    </div>
  )
}

// ─── Payment Detail Panel ─────────────────────────────────────────────────────

function PaymentDetail({ payment, userId, userRole, canConfirm, uploading, onConfirm, onReject, onUploadProof }: {
  payment: RecoveryPayment; userId: string; userRole: string; canConfirm: boolean; uploading: boolean
  onConfirm: () => void; onReject: () => void; onUploadProof: (f: File) => void
}) {
  const fileRef = { current: null as HTMLInputElement | null }
  const isCollector = payment.collectorId === userId
  const isMgr = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER'].includes(userRole)

  return (
    <div className="p-5 w-full space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] text-slate-400 font-mono">{payment.debtor.debtorNumber}</p>
          <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">
            {payment.debtor.firstName} {payment.debtor.lastName}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-black text-green-600">฿{fmt(payment.amount)}</span>
            <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[payment.status]}`}>
              {STATUS_LABELS[payment.status]}
            </span>
          </div>
        </div>
        {/* Actions */}
        {payment.status === 'PENDING' && canConfirm && (
          <div className="flex flex-col gap-2">
            <button onClick={onConfirm}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition">
              ✓ ยืนยัน
            </button>
            <button onClick={onReject}
              className="px-4 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium border border-red-200 dark:border-red-800 transition">
              ✕ ปฏิเสธ
            </button>
          </div>
        )}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          ['ประเภทการชำระ', TYPE_LABELS[payment.paymentType] ?? payment.paymentType],
          ['ช่องทาง',       METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod],
          ['วันที่ชำระ',    fmtD(payment.paymentDate)],
          ['เลขอ้างอิง',   payment.referenceNumber ?? '—'],
          ['ผู้รับชำระ',    payment.collector.name],
          ['แผนก',          payment.collector.department ?? '—'],
        ].map(([label, val]) => (
          <div key={label} className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] p-3">
            <p className="text-[10px] text-slate-400 mb-0.5">{label}</p>
            <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">{val}</p>
          </div>
        ))}
      </div>

      {/* Case & Promise links */}
      {payment.case && (
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 p-3">
          <p className="text-[10px] text-blue-500 mb-0.5">เชื่อมกับคดี</p>
          <p className="text-[13px] font-medium text-blue-700 dark:text-blue-300">[{payment.case.caseNumber}] {payment.case.caseTitle}</p>
        </div>
      )}

      {payment.promise && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-3">
          <p className="text-[10px] text-amber-500 mb-0.5">สัญญาชำระที่เชื่อมกัน</p>
          <p className="text-[13px] font-medium text-amber-700 dark:text-amber-300">
            ฿{fmt(payment.promise.promisedAmount)} — ครบกำหนด {fmtD(payment.promise.promisedDate)}
          </p>
          <p className="text-[11px] text-amber-500 mt-0.5">สถานะ: {payment.promise.status}</p>
        </div>
      )}

      {/* Note */}
      {payment.note && (
        <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] p-3">
          <p className="text-[10px] text-slate-400 mb-1">หมายเหตุ</p>
          <p className="text-[13px] text-slate-700 dark:text-slate-300">{payment.note}</p>
        </div>
      )}

      {/* Proof section */}
      <div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">หลักฐานการชำระ</p>
        {payment.proofUrl ? (
          <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-white/[0.08]">
            <img
              src={payment.proofUrl}
              alt="Proof"
              className="w-full max-h-64 object-contain bg-slate-100 dark:bg-slate-800"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <a
              href={payment.proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-2 right-2 px-2.5 py-1 bg-black/60 text-white text-[11px] rounded-lg hover:bg-black/80"
            >
              เปิดเต็มจอ
            </a>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-white/[0.1] p-4 text-center text-slate-400 text-sm">
            ยังไม่มีหลักฐาน
          </div>
        )}
        {(isCollector || isMgr) && (
          <div className="mt-2">
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              id={`proof-${payment.id}`}
              onChange={e => { const f = e.target.files?.[0]; if (f) onUploadProof(f); e.target.value = '' }}
            />
            <label
              htmlFor={`proof-${payment.id}`}
              className={`cursor-pointer block w-full py-2 text-center text-sm rounded-lg border border-slate-200 dark:border-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.04] transition text-slate-600 dark:text-slate-400 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              {uploading ? 'กำลังอัพโหลด…' : payment.proofUrl ? '🔄 เปลี่ยนหลักฐาน' : '📎 อัพโหลดหลักฐาน'}
            </label>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Dashboard View ───────────────────────────────────────────────────────────

function DashboardView({ data, onConfirm }: { data: DashboardData; onConfirm: (id: string) => void }) {
  const kpiCards = [
    { label: 'วันนี้',       value: data.kpi.today,    color: 'text-blue-600' },
    { label: 'สัปดาห์นี้',   value: data.kpi.week,     color: 'text-violet-600' },
    { label: 'เดือนนี้',     value: data.kpi.month,    color: 'text-green-600' },
    { label: 'ทั้งหมด',       value: data.kpi.allTime,  color: 'text-slate-700 dark:text-slate-200' },
  ]

  return (
    <div className="space-y-6 max-w-none">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map(c => (
          <div key={c.label} className="rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-white/[0.07] p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{c.label}</p>
            <p className={`text-xl font-black ${c.color}`}>฿{fmt(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Month vs prev */}
      {data.kpi.monthGrowth !== null && (
        <div className={`rounded-xl px-4 py-3 border text-sm font-medium ${data.kpi.monthGrowth >= 0 ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'}`}>
          {data.kpi.monthGrowth >= 0 ? '▲' : '▼'} เดือนนี้ {data.kpi.monthGrowth >= 0 ? '+' : ''}{data.kpi.monthGrowth.toFixed(1)}% เทียบเดือนก่อน (฿{fmt(data.kpi.prevMonth)})
        </div>
      )}

      {/* Status counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'ทั้งหมด',    value: data.counts.total,     color: 'text-slate-700 dark:text-slate-200' },
          { label: 'รออนุมัติ',   value: data.counts.pending,   color: 'text-yellow-600' },
          { label: 'ยืนยันแล้ว', value: data.counts.confirmed,  color: 'text-green-600' },
          { label: 'ปฏิเสธ',     value: data.counts.rejected,   color: 'text-red-600' },
        ].map(c => (
          <div key={c.label} className="rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-white/[0.07] p-3 text-center">
            <p className="text-[10px] text-slate-400 mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Collector leaderboard */}
        <div className="rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-white/[0.07] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.05]">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">🏆 อันดับผู้เก็บเงิน (เดือนนี้)</h3>
          </div>
          <div className="p-3 space-y-2">
            {data.leaderboard.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-4">ยังไม่มีข้อมูล</p>
            ) : data.leaderboard.map((c, i) => (
              <div key={c.collectorId} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-bold flex-shrink-0 ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-slate-300 text-slate-700' : i === 2 ? 'bg-orange-300 text-orange-900' : 'bg-slate-100 text-slate-500'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 truncate">{c.name}</p>
                  <p className="text-[10px] text-slate-400">{c.department ?? '—'} · {c.count} รายการ</p>
                </div>
                <p className="text-[13px] font-bold text-green-600 flex-shrink-0">฿{fmt(c.amount)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Top paying debtors */}
        <div className="rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-white/[0.07] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.05]">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">💰 ลูกหนี้ชำระสูงสุด (เดือนนี้)</h3>
          </div>
          <div className="p-3 space-y-2">
            {data.topDebtors.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-4">ยังไม่มีข้อมูล</p>
            ) : data.topDebtors.map(d => (
              <div key={d.debtorId} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 truncate">{d.firstName} {d.lastName}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{d.debtorNumber}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[13px] font-bold text-green-600">฿{fmt(d.paidThisMonth)}</p>
                  <p className="text-[10px] text-red-400">คงเหลือ ฿{fmt(d.remainingDebt ?? 0)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overdue promise alerts */}
      {data.alerts.overduePromises.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-800/60 border border-red-200 dark:border-red-800/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-red-100 dark:border-red-800/30 bg-red-50 dark:bg-red-900/10">
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">
              🚨 สัญญาชำระเกินกำหนด ({data.alerts.overduePromises.length} รายการ)
            </h3>
          </div>
          <div className="p-3 space-y-2">
            {data.alerts.overduePromises.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-red-100 dark:border-red-800/30 bg-red-50/50 dark:bg-red-900/10">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 truncate">{p.debtorName}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{p.debtorNumber}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[13px] font-bold text-amber-600">฿{fmt(p.promisedAmount)}</p>
                  <p className="text-[10px] text-red-500">เกินกำหนด {p.daysOverdue} วัน</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment by type */}
      {data.byType.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-white/[0.07] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.05]">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">จำแนกตามประเภทการชำระ</h3>
          </div>
          <div className="p-3 grid grid-cols-2 md:grid-cols-3 gap-2">
            {data.byType.map(t => (
              <div key={t.type} className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05]">
                <p className="text-[10px] text-slate-400 truncate">{TYPE_LABELS[t.type] ?? t.type}</p>
                <p className="text-[13px] font-bold text-green-600 mt-0.5">฿{fmt(t.amount)}</p>
                <p className="text-[10px] text-slate-400">{t.count} รายการ</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent payments */}
      <div className="rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-white/[0.07] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.05]">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">รายการล่าสุด</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 border-b border-slate-100 dark:border-white/[0.05]">
                <th className="text-left px-4 py-2">ลูกหนี้</th>
                <th className="text-left px-4 py-2">ประเภท</th>
                <th className="text-right px-4 py-2">จำนวน</th>
                <th className="text-left px-4 py-2">ผู้รับ</th>
                <th className="text-left px-4 py-2">วันที่</th>
                <th className="text-left px-4 py-2">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {data.recentPayments.map(p => (
                <tr key={p.id} className="border-b border-slate-50 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{p.debtor.firstName} {p.debtor.lastName}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{p.debtor.debtorNumber}</p>
                  </td>
                  <td className="px-4 py-2 text-[12px] text-slate-600 dark:text-slate-400">{TYPE_LABELS[p.paymentType] ?? p.paymentType}</td>
                  <td className="px-4 py-2 text-right font-bold text-green-600">฿{fmt(p.amount)}</td>
                  <td className="px-4 py-2 text-[12px] text-slate-600 dark:text-slate-400">{p.collector.name}</td>
                  <td className="px-4 py-2 text-[11px] text-slate-400">{fmtD(p.paymentDate)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.recentPayments.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-8">ยังไม่มีรายการ</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Create Payment Modal ─────────────────────────────────────────────────────

function CreatePaymentModal({ userId, userRole, employees, debtors, canConfirm, onClose, onSave }: {
  userId: string; userRole: string; employees: Employee[]; debtors: Debtor[]
  canConfirm: boolean; onClose: () => void; onSave: () => void
}) {
  const [form, setForm] = useState({
    debtorId:       '',
    paymentType:    'FULL_PAYMENT',
    amount:         '',
    paymentDate:    new Date().toISOString().slice(0, 10),
    paymentMethod:  'BANK_TRANSFER',
    referenceNumber: '',
    collectorId:    userId,
    note:           '',
  })
  const [saving, setSaving] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.debtorId || !form.amount) return
    setSaving(true)
    const r = await fetch('/api/recovery/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: Number(form.amount), referenceNumber: form.referenceNumber || null, note: form.note || null }),
    })
    if (r.ok) {
      const payment = await r.json()
      // Upload proof if selected
      if (proofFile) {
        const fd = new FormData()
        fd.append('file', proofFile)
        await fetch(`/api/recovery/payments/${payment.id}/proof`, { method: 'POST', body: fd })
      }
      setSaving(false)
      onSave()
    } else {
      setSaving(false)
    }
  }

  const selectedDebtor = debtors.find(d => d.id === form.debtorId)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
      <div className="flex min-h-full items-end md:items-center justify-center p-0 md:p-4">
        <div className="bg-white dark:bg-slate-900 rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-xl">
          <div className="flex items-center justify-between p-4 md:p-5 border-b border-slate-200 dark:border-white/[0.06]">
            <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">บันทึกการชำระเงิน</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
          </div>

          <div className="p-4 md:p-5 space-y-4">
            {/* Debtor select */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">ลูกหนี้ *</label>
              <select value={form.debtorId} onChange={e => set('debtorId', e.target.value)}
                className="w-full h-10 text-sm border border-slate-200 dark:border-white/[0.1] rounded-xl px-3 bg-white dark:bg-white/[0.05] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="">— เลือกลูกหนี้ —</option>
                {debtors.map(d => <option key={d.id} value={d.id}>[{d.debtorNumber}] {d.firstName} {d.lastName}</option>)}
              </select>
              {selectedDebtor && (
                <p className="text-[11px] text-red-500 mt-1">คงเหลือ: ฿{fmt(selectedDebtor.remainingDebt)}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">ประเภทการชำระ</label>
                <select value={form.paymentType} onChange={e => set('paymentType', e.target.value)}
                  className="w-full h-10 text-sm border border-slate-200 dark:border-white/[0.1] rounded-xl px-3 bg-white dark:bg-white/[0.05] text-slate-900 dark:text-white focus:outline-none">
                  {PAYMENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">ช่องทาง</label>
                <select value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}
                  className="w-full h-10 text-sm border border-slate-200 dark:border-white/[0.1] rounded-xl px-3 bg-white dark:bg-white/[0.05] text-slate-900 dark:text-white focus:outline-none">
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">จำนวน (บาท) *</label>
                <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0"
                  className="w-full h-10 text-sm border border-slate-200 dark:border-white/[0.1] rounded-xl px-3 bg-white dark:bg-white/[0.05] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">วันที่ชำระ</label>
                <input type="date" value={form.paymentDate} onChange={e => set('paymentDate', e.target.value)}
                  className="w-full h-10 text-sm border border-slate-200 dark:border-white/[0.1] rounded-xl px-3 bg-white dark:bg-white/[0.05] text-slate-900 dark:text-white focus:outline-none" />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500 mb-1 block">เลขอ้างอิง / สลิป</label>
              <input value={form.referenceNumber} onChange={e => set('referenceNumber', e.target.value)} placeholder="เลขที่รายการ…"
                className="w-full h-10 text-sm border border-slate-200 dark:border-white/[0.1] rounded-xl px-3 bg-white dark:bg-white/[0.05] text-slate-900 dark:text-white focus:outline-none" />
            </div>

            {canConfirm && (
              <div>
                <label className="text-xs text-slate-500 mb-1 block">ผู้รับชำระ</label>
                <select value={form.collectorId} onChange={e => set('collectorId', e.target.value)}
                  className="w-full h-10 text-sm border border-slate-200 dark:border-white/[0.1] rounded-xl px-3 bg-white dark:bg-white/[0.05] text-slate-900 dark:text-white focus:outline-none">
                  <option value={userId}>ตัวเอง</option>
                  {employees.filter(e => e.id !== userId).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}

            {/* Proof upload */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">หลักฐานการชำระ (ไม่บังคับ)</label>
              <div className="flex items-center gap-2">
                <label className="flex-1 h-10 flex items-center justify-center text-sm border-2 border-dashed border-slate-200 dark:border-white/[0.1] rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03] text-slate-500 transition">
                  {proofFile ? proofFile.name : '📎 เลือกไฟล์'}
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setProofFile(e.target.files?.[0] ?? null)} />
                </label>
                {proofFile && <button onClick={() => setProofFile(null)} className="text-slate-400 hover:text-red-500 text-xs">ลบ</button>}
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500 mb-1 block">หมายเหตุ</label>
              <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2}
                className="w-full text-sm border border-slate-200 dark:border-white/[0.1] rounded-xl px-3 py-2 bg-white dark:bg-white/[0.05] text-slate-900 dark:text-white resize-none focus:outline-none"
                placeholder="รายละเอียดเพิ่มเติม…" />
            </div>
          </div>

          <div className="flex gap-3 justify-end p-4 md:p-5 pt-0">
            <button onClick={onClose} className="px-5 py-2 border border-slate-200 dark:border-white/[0.1] rounded-xl text-sm hover:bg-slate-50 dark:hover:bg-white/[0.05] text-slate-700 dark:text-slate-300 transition">
              ยกเลิก
            </button>
            <button onClick={save} disabled={saving || !form.debtorId || !form.amount}
              className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition">
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
