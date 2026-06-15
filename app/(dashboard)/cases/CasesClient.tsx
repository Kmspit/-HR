'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────────
type CaseType     = 'DEBT_COLLECTION' | 'LEGAL' | 'COURT' | 'ASSET_INVESTIGATION' | 'ENFORCEMENT' | 'INTERNAL_LEGAL'
type CaseStatus   = 'NEW' | 'ASSIGNED' | 'INVESTIGATING' | 'NEGOTIATING' | 'WAITING_DOCUMENT' | 'FILED' | 'COURT_PROCESS' | 'ENFORCEMENT' | 'SETTLED' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED'
type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

interface CaseItem {
  id: string
  caseNumber: string
  caseTitle: string
  caseType: CaseType
  status: CaseStatus
  priority: CasePriority
  debtAmount: number | null
  department: string | null
  dueDate: string | null
  updatedAt: string
  assignedEmployee: { id: string; name: string; department: string | null } | null
  client: { clientName: string | null; companyName: string | null; phone: string | null } | null
  debtor: { fullName: string; phone: string | null; riskLevel: string } | null
  _count: { tasks: number; courts: number }
}

interface User { id: string; name: string; role: string; department: string | null }

// ── Labels / Colors ────────────────────────────────────────────────────────
const TYPE_LABELS: Record<CaseType, string> = {
  DEBT_COLLECTION:   'เร่งรัดหนี้',
  LEGAL:             'กฎหมาย',
  COURT:             'คดีศาล',
  ASSET_INVESTIGATION: 'สืบทรัพย์',
  ENFORCEMENT:       'บังคับคดี',
  INTERNAL_LEGAL:    'กฎหมายภายใน',
}
const TYPE_COLOR: Record<CaseType, string> = {
  DEBT_COLLECTION:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  LEGAL:             'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  COURT:             'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  ASSET_INVESTIGATION: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  ENFORCEMENT:       'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  INTERNAL_LEGAL:    'bg-slate-100 text-slate-700 dark:bg-slate-700/30 dark:text-slate-300',
}
const STATUS_LABELS: Record<CaseStatus, string> = {
  NEW:              'ใหม่', ASSIGNED:  'มอบหมายแล้ว', INVESTIGATING: 'กำลังสืบสวน',
  NEGOTIATING:      'เจรจา', WAITING_DOCUMENT: 'รอเอกสาร', FILED: 'ยื่นฟ้อง',
  COURT_PROCESS:    'ชั้นศาล', ENFORCEMENT: 'บังคับคดี', SETTLED: 'ยุติ/ตกลง',
  COMPLETED:        'เสร็จสิ้น', ON_HOLD: 'พักคดี', CANCELLED: 'ยกเลิก',
}
const STATUS_COLOR: Record<CaseStatus, string> = {
  NEW:           'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
  ASSIGNED:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  INVESTIGATING: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  NEGOTIATING:   'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  WAITING_DOCUMENT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  FILED:         'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  COURT_PROCESS: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  ENFORCEMENT:   'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  SETTLED:       'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  COMPLETED:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  ON_HOLD:       'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  CANCELLED:     'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
}
const PRIORITY_LABELS: Record<CasePriority, string> = { LOW: 'ต่ำ', MEDIUM: 'ปกติ', HIGH: 'สูง', CRITICAL: 'วิกฤต' }
const PRIORITY_COLOR: Record<CasePriority, string> = {
  LOW:      'text-slate-500',
  MEDIUM:   'text-blue-600',
  HIGH:     'text-orange-600 font-semibold',
  CRITICAL: 'text-red-600 font-bold',
}
const RISK_COLOR: Record<string, string> = {
  LOW:      'text-green-600',
  MEDIUM:   'text-yellow-600',
  HIGH:     'text-orange-600',
  CRITICAL: 'text-red-600 font-semibold',
}

const CAN_CREATE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER', 'LAWYER', 'ENFORCEMENT']

function thb(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}
function fmtDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function CasesClient({ role, userId, userName }: { role: string; userId: string; userName: string }) {
  const [cases,     setCases]     = useState<CaseItem[]>([])
  const [loading,   setLoading]   = useState(true)
  const [employees, setEmployees] = useState<User[]>([])
  const [search,    setSearch]    = useState('')
  const [statusF,   setStatusF]   = useState('')
  const [typeF,     setTypeF]     = useState('')
  const [priorityF, setPriorityF] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const canCreate = CAN_CREATE.includes(role)

  const fetchCases = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (search)    p.set('search',   search)
    if (statusF)   p.set('status',   statusF)
    if (typeF)     p.set('type',     typeF)
    if (priorityF) p.set('priority', priorityF)
    const res = await fetch(`/api/cases?${p}`)
    if (res.ok) { const d = await res.json(); setCases(d.cases) }
    setLoading(false)
  }, [search, statusF, typeF, priorityF])

  useEffect(() => { fetchCases() }, [fetchCases])

  useEffect(() => {
    if (!canCreate) return
    fetch('/api/users?status=ACTIVE&minimal=1').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.users) setEmployees(d.users)
    })
  }, [canCreate])

  return (
    <div className="flex flex-col pb-24 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-white/[0.06] px-4 py-3 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[17px] font-bold text-slate-900 dark:text-white leading-tight">คดีความ</h1>
            <p className="text-[12px] text-slate-400 mt-0.5">{cases.length} คดี</p>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-[13px] font-semibold text-white hover:bg-blue-500 active:scale-[0.97] transition-all shadow-lg shadow-blue-600/20"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              สร้างคดี
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mt-3">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลขคดี / ลูกค้า / ลูกหนี้..."
            className="flex-1 min-w-[160px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-1.5 text-[13px] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select value={statusF} onChange={e => setStatusF(e.target.value)} className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">ทุกสถานะ</option>
            {(Object.entries(STATUS_LABELS) as [CaseStatus, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={typeF} onChange={e => setTypeF(e.target.value)} className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">ทุกประเภท</option>
            {(Object.entries(TYPE_LABELS) as [CaseType, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={priorityF} onChange={e => setPriorityF(e.target.value)} className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">ทุกความเร่งด่วน</option>
            {(Object.entries(PRIORITY_LABELS) as [CasePriority, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">กำลังโหลด...</div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <svg className="h-10 w-10 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <p className="text-sm">ไม่พบคดี</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/[0.05] bg-slate-50/80 dark:bg-white/[0.02]">
                  {['เลขคดี', 'ชื่อคดี', 'ประเภท', 'สถานะ', 'ความเร่งด่วน', 'ลูกค้า', 'ลูกหนี้', 'ผู้รับผิดชอบ', 'วันครบกำหนด', 'อัปเดต'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[12px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {cases.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => window.location.href = `/cases/${c.id}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-[12px] text-blue-600 dark:text-blue-400 font-semibold">{c.caseNumber}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="font-medium text-slate-900 dark:text-white truncate text-[13px]">{c.caseTitle}</p>
                      {c.debtAmount != null && <p className="text-[11px] text-slate-400">฿{thb(c.debtAmount)}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TYPE_COLOR[c.caseType]}`}>{TYPE_LABELS[c.caseType]}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-[12px] ${PRIORITY_COLOR[c.priority]}`}>{PRIORITY_LABELS[c.priority]}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[140px]">
                      <p className="text-[12px] text-slate-700 dark:text-slate-300 truncate">{c.client?.companyName || c.client?.clientName || '-'}</p>
                    </td>
                    <td className="px-4 py-3 max-w-[140px]">
                      {c.debtor ? (
                        <div>
                          <p className="text-[12px] text-slate-700 dark:text-slate-300 truncate">{c.debtor.fullName}</p>
                          <p className={`text-[11px] ${RISK_COLOR[c.debtor.riskLevel]}`}>ความเสี่ยง: {c.debtor.riskLevel}</p>
                        </div>
                      ) : <span className="text-slate-400 text-[12px]">-</span>}
                    </td>
                    <td className="px-4 py-3 max-w-[120px]">
                      <p className="text-[12px] text-slate-700 dark:text-slate-300 truncate">{c.assignedEmployee?.name ?? '-'}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[12px] text-slate-500">
                      {fmtDate(c.dueDate)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[12px] text-slate-400">
                      {fmtDate(c.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">กำลังโหลด...</div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <p className="text-sm">ไม่พบคดี</p>
          </div>
        ) : cases.map(c => (
          <Link key={c.id} href={`/cases/${c.id}`} className="block rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4 active:scale-[0.98] transition-transform">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[11px] text-blue-600 dark:text-blue-400 font-semibold">{c.caseNumber}</p>
                <p className="font-semibold text-slate-900 dark:text-white text-[14px] leading-snug truncate mt-0.5">{c.caseTitle}</p>
              </div>
              <span className={`flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[c.status]}`}>{STATUS_LABELS[c.status]}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TYPE_COLOR[c.caseType]}`}>{TYPE_LABELS[c.caseType]}</span>
              <span className={`text-[11px] ${PRIORITY_COLOR[c.priority]}`}>{PRIORITY_LABELS[c.priority]}</span>
              {c.debtAmount != null && <span className="text-[11px] text-slate-500">฿{thb(c.debtAmount)}</span>}
            </div>
            <div className="text-[12px] text-slate-500 dark:text-slate-400 space-y-0.5">
              {c.client && <p>ลูกค้า: {c.client.companyName || c.client.clientName || '-'}</p>}
              {c.debtor && <p>ลูกหนี้: {c.debtor.fullName} <span className={RISK_COLOR[c.debtor.riskLevel]}>({c.debtor.riskLevel})</span></p>}
              {c.assignedEmployee && <p>ผู้รับผิดชอบ: {c.assignedEmployee.name}</p>}
              <p className="text-slate-400">อัปเดต: {fmtDate(c.updatedAt)}</p>
            </div>
            <div className="mt-2 flex gap-3 text-[11px] text-slate-400">
              <span>📋 {c._count.tasks} งาน</span>
              <span>⚖️ {c._count.courts} นัดศาล</span>
              {c.dueDate && <span>📅 ครบ {fmtDate(c.dueDate)}</span>}
            </div>
          </Link>
        ))}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateCaseModal
          employees={employees}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchCases() }}
          userName={userName}
        />
      )}
    </div>
  )
}

// ── Create Case Modal ──────────────────────────────────────────────────────
function CreateCaseModal({ employees, onClose, onCreated, userName }: {
  employees: User[]
  onClose: () => void
  onCreated: () => void
  userName: string
}) {
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [tab,      setTab]      = useState<'basic' | 'client' | 'debtor'>('basic')

  const [form, setForm] = useState({
    caseTitle: '', caseType: 'DEBT_COLLECTION' as CaseType, priority: 'MEDIUM' as CasePriority,
    description: '', debtAmount: '', department: '', assignedEmployeeId: '', dueDate: '',
  })
  const [client, setClient] = useState({ clientName: '', companyName: '', taxId: '', phone: '', email: '', address: '', contactPerson: '', note: '' })
  const [debtor, setDebtor] = useState({ fullName: '', idCard: '', phone: '', email: '', address: '', workplace: '', riskLevel: 'MEDIUM', assetInfo: '', note: '' })

  function set(k: keyof typeof form, v: string) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.caseTitle.trim()) { setError('กรุณาระบุชื่อคดี'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          debtAmount: form.debtAmount ? Number(form.debtAmount) : null,
          client: (client.clientName || client.companyName) ? client : undefined,
          debtor: debtor.fullName ? debtor : undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'เกิดข้อผิดพลาด'); return }
      onCreated()
    } catch { setError('เกิดข้อผิดพลาด') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full md:max-w-2xl md:max-h-[90vh] bg-white dark:bg-slate-900 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
          <h2 className="font-bold text-slate-900 dark:text-white text-[16px]">สร้างคดีใหม่</h2>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-slate-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Tab Nav */}
        <div className="flex border-b border-slate-100 dark:border-white/[0.06]">
          {(['basic', 'client', 'debtor'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-5 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              {t === 'basic' ? 'ข้อมูลคดี' : t === 'client' ? 'ลูกค้า' : 'ลูกหนี้'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-3">
            {tab === 'basic' && (
              <>
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ชื่อคดี <span className="text-red-500">*</span></label>
                  <input value={form.caseTitle} onChange={e => set('caseTitle', e.target.value)} required className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="ระบุชื่อคดี" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ประเภทคดี <span className="text-red-500">*</span></label>
                    <select value={form.caseType} onChange={e => set('caseType', e.target.value as CaseType)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {(Object.entries(TYPE_LABELS) as [CaseType, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ความเร่งด่วน</label>
                    <select value={form.priority} onChange={e => set('priority', e.target.value as CasePriority)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {(Object.entries(PRIORITY_LABELS) as [CasePriority, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">มูลหนี้ (บาท)</label>
                    <input type="number" value={form.debtAmount} onChange={e => set('debtAmount', e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" min="0" step="0.01" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">วันครบกำหนด</label>
                    <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ผู้รับผิดชอบ</label>
                  <select value={form.assignedEmployeeId} onChange={e => set('assignedEmployeeId', e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— ไม่ระบุ —</option>
                    {employees.map(u => <option key={u.id} value={u.id}>{u.name} {u.department ? `(${u.department})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">รายละเอียด</label>
                  <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="รายละเอียดคดี..." />
                </div>
              </>
            )}

            {tab === 'client' && (
              <>
                <p className="text-[12px] text-slate-400 mb-2">ข้อมูลลูกค้า (ผู้ว่าจ้าง)</p>
                {(['clientName', 'companyName', 'taxId', 'phone', 'email', 'contactPerson'] as const).map(k => (
                  <div key={k}>
                    <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {k === 'clientName' ? 'ชื่อลูกค้า' : k === 'companyName' ? 'ชื่อบริษัท' : k === 'taxId' ? 'เลขประจำตัวผู้เสียภาษี' : k === 'phone' ? 'โทรศัพท์' : k === 'email' ? 'อีเมล' : 'ผู้ติดต่อ'}
                    </label>
                    <input value={client[k]} onChange={e => setClient(p => ({ ...p, [k]: e.target.value }))} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ที่อยู่</label>
                  <textarea value={client.address} onChange={e => setClient(p => ({ ...p, address: e.target.value }))} rows={2} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              </>
            )}

            {tab === 'debtor' && (
              <>
                <p className="text-[12px] text-slate-400 mb-2">ข้อมูลลูกหนี้/ผู้ถูกฟ้อง</p>
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ชื่อ-นามสกุล</label>
                  <input value={debtor.fullName} onChange={e => setDebtor(p => ({ ...p, fullName: e.target.value }))} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="ชื่อ-นามสกุลลูกหนี้" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">เลขบัตรประชาชน</label>
                    <input value={debtor.idCard} onChange={e => setDebtor(p => ({ ...p, idCard: e.target.value }))} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">โทรศัพท์</label>
                    <input value={debtor.phone} onChange={e => setDebtor(p => ({ ...p, phone: e.target.value }))} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ระดับความเสี่ยง</label>
                  <select value={debtor.riskLevel} onChange={e => setDebtor(p => ({ ...p, riskLevel: e.target.value }))} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="LOW">ต่ำ</option>
                    <option value="MEDIUM">ปานกลาง</option>
                    <option value="HIGH">สูง</option>
                    <option value="CRITICAL">วิกฤต</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">สถานที่ทำงาน</label>
                  <input value={debtor.workplace} onChange={e => setDebtor(p => ({ ...p, workplace: e.target.value }))} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ที่อยู่</label>
                  <textarea value={debtor.address} onChange={e => setDebtor(p => ({ ...p, address: e.target.value }))} rows={2} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ข้อมูลทรัพย์สิน</label>
                  <textarea value={debtor.assetInfo} onChange={e => setDebtor(p => ({ ...p, assetInfo: e.target.value }))} rows={2} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="บ้าน / ที่ดิน / รถยนต์ ฯลฯ" />
                </div>
              </>
            )}

            {error && <p className="text-[13px] text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-slate-100 dark:border-white/[0.06]">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 py-2.5 text-[14px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors">
              ยกเลิก
            </button>
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-[14px] font-semibold text-white hover:bg-blue-500 disabled:opacity-60 transition-colors">
              {saving ? 'กำลังสร้าง...' : 'สร้างคดี'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
