'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface User { id: string; name: string; department: string | null; role: string }

interface ClientCompany {
  id: string; clientCode: string; companyName: string; contactName?: string
  phone?: string; email?: string; lineId?: string; address?: string; taxId?: string
  clientType: string; status: string; creditLimit?: number
  startDate?: string; endDate?: string; note?: string
  createdAt: string; updatedAt: string; createdBy: User
  _count?: { contracts: number; tasks: number; slaRecords: number }
  contracts?: ClientContract[]; slaRecords?: SlaRecord[]
  files?: CompanyFile[]; tasks?: Task[]
  _revenue?: { income: number; expense: number; profit: number }
}

interface ClientContract {
  id: string; contractNumber: string; serviceType: string
  startDate: string; endDate: string; value: number
  slaAgreement?: string; paymentTerms?: string; status: string; note?: string
  createdBy: User; files?: CompanyFile[]; slaRecords?: SlaRecord[]
}

interface SlaRecord {
  id: string; slaType: string; targetHours: number; actualHours?: number
  met?: boolean; note?: string; createdBy: User; createdAt: string; resolvedAt?: string
}

interface CompanyFile {
  id: string; url: string; filename: string; fileType: string
  size: number; docType: string; createdBy: User; createdAt: string
  contractId?: string
}

interface Task {
  id: string; title: string; status: string; caseNumber?: string
  assignee: User; updatedAt: string
}

interface Summary {
  totalCompanies: number; statusMap: Record<string, number>
  totalContractValue: number; expiring7: number; expiring30: number
  expiring60: number; expiring90: number
  topRevenue: { id: string; clientCode: string; companyName: string; status: string; taskCount: number; contractValue: number }[]
  expiringContracts: (ClientContract & { clientCompany: { id: string; clientCode: string; companyName: string } })[]
  sla: { met: number; missed: number; total: number; rate: number | null }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLIENT_STATUSES  = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CONTRACT_EXPIRED']
const CONTRACT_STATUSES = ['ACTIVE', 'EXPIRED', 'TERMINATED', 'PENDING']
const CLIENT_TYPES     = ['CORPORATE', 'SME', 'INDIVIDUAL', 'GOVERNMENT']
const SLA_TYPES        = ['ติดต่อลูกหนี้ภายใน 3 วัน', 'ส่งเอกสารภายใน 24 ชั่วโมง', 'ตอบกลับลูกค้าไม่เกิน 4 ชั่วโมง', 'รายงานผลภายใน 1 อาทิตย์', 'อื่นๆ']
const DOC_TYPES        = ['สัญญา', 'เอกสารภาษี', 'ใบแจ้งหนี้', 'ข้อตกลง', 'อื่นๆ']

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:   'bg-green-100 text-green-700', INACTIVE:  'bg-gray-100 text-gray-600',
  SUSPENDED: 'bg-red-100 text-red-700',    CONTRACT_EXPIRED: 'bg-orange-100 text-orange-700',
}
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'ใช้งาน', INACTIVE: 'ไม่ใช้งาน', SUSPENDED: 'ระงับ', CONTRACT_EXPIRED: 'สัญญาหมด',
}
const CONTRACT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700', EXPIRED: 'bg-red-100 text-red-700',
  TERMINATED: 'bg-gray-100 text-gray-600', PENDING: 'bg-yellow-100 text-yellow-700',
}
const CONTRACT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'มีผล', EXPIRED: 'หมดอายุ', TERMINATED: 'ยกเลิก', PENDING: 'รออนุมัติ',
}
const TYPE_LABELS: Record<string, string> = {
  CORPORATE: 'บริษัท', SME: 'SME', INDIVIDUAL: 'บุคคล', GOVERNMENT: 'รัฐ/เอกชน',
}

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']
const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0 })
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const daysLeft = (d?: string) => {
  if (!d) return null
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000)
  return diff
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientCompaniesClient({ userId, userRole }: { userId: string; userRole: string }) {
  const canManage  = CAN_MANAGE.includes(userRole)
  const [mainTab,  setMainTab]    = useState<'list' | 'dashboard'>('list')
  const [companies, setCompanies] = useState<ClientCompany[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [q,         setQ]         = useState('')
  const [filterSt,  setFilterSt]  = useState('')
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<ClientCompany | null>(null)
  const [detailTab, setDetailTab] = useState<'info'|'contracts'|'sla'|'history'|'revenue'|'files'>('info')
  const [summary,   setSummary]   = useState<Summary | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit,   setShowEdit]   = useState(false)

  const loadCompanies = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/client-companies?q=${encodeURIComponent(q)}&status=${filterSt}&page=${page}`)
    if (r.ok) { const d = await r.json(); setCompanies(d.items); setTotal(d.total) }
    setLoading(false)
  }, [q, filterSt, page])

  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/client-companies/${id}`)
    if (r.ok) setSelected(await r.json())
  }, [])

  const loadSummary = useCallback(async () => {
    if (!canManage) return
    const r = await fetch('/api/client-companies/summary')
    if (r.ok) setSummary(await r.json())
  }, [canManage])

  useEffect(() => { loadCompanies() }, [loadCompanies])
  useEffect(() => { if (mainTab === 'dashboard') loadSummary() }, [mainTab, loadSummary])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ลูกค้าองค์กร</h1>
          <p className="text-sm text-gray-500 mt-0.5">Client CRM — Contract & SLA Management</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setMainTab('list')} className={`px-4 py-2 rounded-lg text-sm font-medium ${mainTab==='list' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>รายชื่อ</button>
          {canManage && <button onClick={() => setMainTab('dashboard')} className={`px-4 py-2 rounded-lg text-sm font-medium ${mainTab==='dashboard' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>Dashboard</button>}
          {canManage && <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">+ เพิ่มลูกค้า</button>}
        </div>
      </div>

      {mainTab === 'dashboard' ? (
        <DashboardTab summary={summary} />
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Left: list */}
          <div className="w-80 flex-shrink-0 flex flex-col gap-3">
            <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="ค้นหาบริษัท / รหัส…" className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <select value={filterSt} onChange={e => { setFilterSt(e.target.value); setPage(1) }} className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              <option value="">ทุกสถานะ</option>
              {CLIENT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {loading ? (
                <p className="text-center text-sm text-gray-400 py-6">กำลังโหลด…</p>
              ) : companies.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-6">ไม่มีข้อมูล</p>
              ) : companies.map(c => {
                const nearestEnd = c.contracts?.[0]?.endDate
                const days       = daysLeft(nearestEnd)
                const expWarn    = days != null && days >= 0 && days <= 30
                return (
                  <button key={c.id} onClick={() => { loadDetail(c.id); setDetailTab('info') }} className={`w-full text-left p-3 rounded-xl border transition-all ${selected?.id === c.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400 font-mono">{c.clientCode}</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.companyName}</p>
                        {c.contactName && <p className="text-xs text-gray-500">{c.contactName}</p>}
                        {c.phone && <p className="text-xs text-gray-400">📱 {c.phone}</p>}
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end gap-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                        <span className="text-[10px] text-gray-400">{TYPE_LABELS[c.clientType]}</span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                      <span>{c._count?.contracts ?? 0} สัญญา · {c._count?.tasks ?? 0} คดี</span>
                      {expWarn && <span className="text-orange-600 font-medium">⚠️ หมด {days}ว.</span>}
                    </div>
                  </button>
                )
              })}
            </div>
            {total > 50 && (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-2 py-1 rounded border disabled:opacity-40">‹</button>
                <span>{page} / {Math.ceil(total / 50)}</span>
                <button onClick={() => setPage(p => p+1)} disabled={page >= Math.ceil(total/50)} className="px-2 py-1 rounded border disabled:opacity-40">›</button>
              </div>
            )}
          </div>

          {/* Right: detail */}
          <div className="flex-1 min-w-0">
            {selected ? (
              <CompanyDetail
                company={selected}
                activeTab={detailTab}
                setActiveTab={setDetailTab}
                userId={userId}
                userRole={userRole}
                canManage={canManage}
                onRefresh={() => { loadDetail(selected.id); loadCompanies() }}
                onEdit={() => setShowEdit(true)}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center"><div className="text-5xl mb-3">🏢</div><p className="text-sm">เลือกลูกค้าเพื่อดูรายละเอียด</p></div>
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && <CompanyModal mode="create" userId={userId} onClose={() => setShowCreate(false)} onSave={() => { setShowCreate(false); loadCompanies() }} />}
      {showEdit && selected && <CompanyModal mode="edit" company={selected} userId={userId} onClose={() => setShowEdit(false)} onSave={() => { setShowEdit(false); loadDetail(selected.id); loadCompanies() }} />}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function DashboardTab({ summary }: { summary: Summary | null }) {
  if (!summary) return <div className="text-center py-16 text-gray-400">กำลังโหลด…</div>
  return (
    <div className="space-y-6 overflow-y-auto">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'ลูกค้าทั้งหมด',       value: summary.totalCompanies.toLocaleString(),                        color: 'text-blue-600' },
          { label: 'มูลค่าสัญญารวม',      value: `฿${fmt(summary.totalContractValue)}`,                         color: 'text-green-600' },
          { label: 'หมดอายุใน 30 วัน',    value: summary.expiring30.toLocaleString(),                           color: summary.expiring30 > 0 ? 'text-orange-600' : 'text-gray-500' },
          { label: 'SLA ผ่าน',            value: summary.sla.rate != null ? `${summary.sla.rate.toFixed(1)}%` : '—', color: 'text-purple-600' },
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">สถานะลูกค้า</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CLIENT_STATUSES.map(s => (
            <div key={s} className={`rounded-lg p-2 text-center ${STATUS_COLORS[s]}`}>
              <p className="text-xs">{STATUS_LABELS[s]}</p>
              <p className="text-lg font-bold">{summary.statusMap[s] ?? 0}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contract expiry warnings */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'หมดใน 7 วัน',  value: summary.expiring7,  color: 'border-red-300 text-red-600' },
          { label: 'หมดใน 30 วัน', value: summary.expiring30, color: 'border-orange-300 text-orange-600' },
          { label: 'หมดใน 60 วัน', value: summary.expiring60, color: 'border-yellow-300 text-yellow-600' },
          { label: 'หมดใน 90 วัน', value: summary.expiring90, color: 'border-gray-300 text-gray-600' },
        ].map(c => (
          <div key={c.label} className={`bg-white dark:bg-gray-800 rounded-xl border-2 p-3 text-center ${c.color}`}>
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Top revenue + expiring list side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top by contract value */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">มูลค่าสัญญาสูงสุด 10 อันดับ</h3>
          <div className="space-y-2">
            {summary.topRevenue.map((c, i) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-gray-400 w-5">{i+1}.</span>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.companyName}</p>
                    <p className="text-xs text-gray-400">{c.taskCount} คดี</p>
                  </div>
                </div>
                <span className="font-semibold text-green-600 whitespace-nowrap ml-2">฿{fmt(c.contractValue)}</span>
              </div>
            ))}
            {summary.topRevenue.length === 0 && <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีข้อมูล</p>}
          </div>
        </div>

        {/* Expiring contracts */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">สัญญาที่ใกล้หมดอายุ (90 วัน)</h3>
          <div className="space-y-2">
            {summary.expiringContracts.map(c => {
              const days = daysLeft(c.endDate)
              return (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.clientCompany.companyName}</p>
                    <p className="text-xs text-gray-400 font-mono">{c.contractNumber}</p>
                  </div>
                  <div className="text-right ml-2 flex-shrink-0">
                    <p className={`text-xs font-semibold ${days != null && days <= 7 ? 'text-red-600' : days != null && days <= 30 ? 'text-orange-600' : 'text-yellow-600'}`}>{days}ว.</p>
                    <p className="text-xs text-gray-400">{fmtDate(c.endDate)}</p>
                  </div>
                </div>
              )
            })}
            {summary.expiringContracts.length === 0 && <p className="text-sm text-gray-400 text-center py-4">ไม่มีสัญญาหมดอายุ</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Company detail panel ─────────────────────────────────────────────────────

function CompanyDetail({ company, activeTab, setActiveTab, userId, userRole, canManage, onRefresh, onEdit }: {
  company: ClientCompany; activeTab: string
  setActiveTab: (t: 'info'|'contracts'|'sla'|'history'|'revenue'|'files') => void
  userId: string; userRole: string; canManage: boolean
  onRefresh: () => void; onEdit: () => void
}) {
  const tabs: { key: 'info'|'contracts'|'sla'|'history'|'revenue'|'files'; label: string }[] = [
    { key: 'info',      label: 'ข้อมูล' },
    { key: 'contracts', label: `สัญญา (${company._count?.contracts ?? company.contracts?.length ?? 0})` },
    { key: 'sla',       label: `SLA (${company._count?.slaRecords ?? company.slaRecords?.length ?? 0})` },
    { key: 'history',   label: `ประวัติงาน (${company._count?.tasks ?? company.tasks?.length ?? 0})` },
    { key: 'revenue',   label: 'รายได้' },
    { key: 'files',     label: `ไฟล์ (${company.files?.length ?? 0})` },
  ]

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 font-mono">{company.clientCode}</p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{company.companyName}</h2>
            {company.contactName && <p className="text-sm text-gray-500">👤 {company.contactName}</p>}
            {company.phone && <p className="text-sm text-gray-500">📱 {company.phone}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[company.status]}`}>{STATUS_LABELS[company.status]}</span>
            <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">{TYPE_LABELS[company.clientType]}</span>
            {canManage && <button onClick={onEdit} className="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">แก้ไข</button>}
          </div>
        </div>
        {company.creditLimit && (
          <div className="mt-2 text-xs text-gray-500">วงเงินบริการ: <span className="font-medium text-gray-800 dark:text-gray-200">฿{fmt(company.creditLimit)}</span></div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 px-4 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className={`text-sm px-3 py-2.5 whitespace-nowrap border-b-2 transition-colors ${activeTab===t.key ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'info'      && <InfoTab      company={company} />}
        {activeTab === 'contracts' && <ContractsTab company={company} userId={userId} onRefresh={onRefresh} />}
        {activeTab === 'sla'       && <SlaTab       company={company} userId={userId} onRefresh={onRefresh} />}
        {activeTab === 'history'   && <HistoryTab   company={company} />}
        {activeTab === 'revenue'   && <RevenueTab   company={company} />}
        {activeTab === 'files'     && <FilesTab     company={company} onRefresh={onRefresh} />}
      </div>
    </div>
  )
}

// ─── Info tab ─────────────────────────────────────────────────────────────────

function InfoTab({ company }: { company: ClientCompany }) {
  const rows = [
    ['เลขภาษี', company.taxId], ['Email', company.email], ['LINE', company.lineId],
    ['ที่อยู่', company.address], ['วันเริ่มสัญญา', fmtDate(company.startDate)],
    ['วันหมดสัญญา', company.endDate ? fmtDate(company.endDate) : null],
    ['ผู้สร้าง', company.createdBy?.name],
  ]
  return (
    <div className="space-y-2">
      {rows.map(([label, val]) => val ? (
        <div key={label as string} className="flex text-sm">
          <span className="w-36 text-gray-500 flex-shrink-0">{label}</span>
          <span className="text-gray-900 dark:text-white">{val}</span>
        </div>
      ) : null)}
      {company.note && <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg text-sm border border-yellow-100 dark:border-yellow-900/30"><p className="text-xs text-gray-400 mb-1">หมายเหตุ</p>{company.note}</div>}
    </div>
  )
}

// ─── Contracts tab ────────────────────────────────────────────────────────────

function ContractsTab({ company, userId, onRefresh }: { company: ClientCompany; userId: string; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ serviceType: '', startDate: '', endDate: '', value: '', slaAgreement: '', paymentTerms: '', note: '' })
  const [saving, setSaving]     = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState('')

  const save = async () => {
    if (!form.serviceType || !form.startDate || !form.endDate) return
    setSaving(true)
    await fetch(`/api/client-companies/${company.id}/contracts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, value: Number(form.value || 0) }),
    })
    setSaving(false); setShowForm(false); setForm({ serviceType: '', startDate: '', endDate: '', value: '', slaAgreement: '', paymentTerms: '', note: '' }); onRefresh()
  }

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/contracts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setEditId(null); onRefresh()
  }

  const contracts = company.contracts ?? []
  return (
    <div className="space-y-3">
      <button onClick={() => setShowForm(!showForm)} className="w-full py-2 border-2 border-dashed border-blue-300 text-blue-600 rounded-lg text-sm hover:bg-blue-50 dark:hover:bg-blue-900/10">+ เพิ่มสัญญา</button>
      {showForm && (
        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 space-y-3 border border-blue-200 dark:border-blue-800">
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'serviceType', label: 'ประเภทบริการ *', placeholder: 'เช่น เร่งรัดหนี้สิน' },
              { key: 'value',       label: 'มูลค่าสัญญา (บาท)', placeholder: '0', type: 'number' },
              { key: 'startDate',   label: 'วันเริ่ม *',   placeholder: '', type: 'date' },
              { key: 'endDate',     label: 'วันหมดอายุ *', placeholder: '', type: 'date' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                <input type={f.type ?? 'text'} value={form[f.key as keyof typeof form]} onChange={e => setForm(p => ({...p, [f.key]: e.target.value}))} placeholder={f.placeholder} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
            ))}
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">ข้อตกลง SLA</label>
              <input value={form.slaAgreement} onChange={e => setForm(p => ({...p, slaAgreement: e.target.value}))} placeholder="เช่น ตอบกลับใน 24 ชั่วโมง" className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">เงื่อนไขการชำระ</label>
              <input value={form.paymentTerms} onChange={e => setForm(p => ({...p, paymentTerms: e.target.value}))} placeholder="เช่น ชำระรายเดือน Net 30" className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg">ยกเลิก</button>
            <button onClick={save} disabled={saving || !form.serviceType || !form.startDate || !form.endDate} className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">{saving ? 'กำลังบันทึก…' : 'เพิ่มสัญญา'}</button>
          </div>
        </div>
      )}
      {contracts.length === 0 ? <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีสัญญา</p> : contracts.map(c => {
        const days = daysLeft(c.endDate)
        const expiring = c.status === 'ACTIVE' && days != null && days >= 0 && days <= 30
        return (
          <div key={c.id} className={`bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-sm border ${expiring ? 'border-orange-300 dark:border-orange-700' : 'border-transparent'}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-gray-400">{c.contractNumber}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${CONTRACT_STATUS_COLORS[c.status]}`}>{CONTRACT_STATUS_LABELS[c.status]}</span>
                  {expiring && <span className="text-[10px] text-orange-600 font-medium">⚠️ หมดใน {days}ว.</span>}
                </div>
                <p className="font-medium">{c.serviceType}</p>
                <p className="text-green-600 font-semibold">฿{fmt(c.value)}</p>
                <p className="text-xs text-gray-500">{fmtDate(c.startDate)} — {fmtDate(c.endDate)}</p>
                {c.slaAgreement && <p className="text-xs text-blue-600 mt-1">SLA: {c.slaAgreement}</p>}
                {c.paymentTerms && <p className="text-xs text-gray-400">เงื่อนไข: {c.paymentTerms}</p>}
              </div>
              {c.status === 'ACTIVE' && (
                <div className="flex flex-col gap-1">
                  {['EXPIRED', 'TERMINATED'].map(s => (
                    <button key={s} onClick={() => updateStatus(c.id, s)} className="text-[10px] px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded">{CONTRACT_STATUS_LABELS[s]}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── SLA tab ──────────────────────────────────────────────────────────────────

function SlaTab({ company, userId, onRefresh }: { company: ClientCompany; userId: string; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ slaType: SLA_TYPES[0], targetHours: '24', actualHours: '', met: '', note: '' })
  const [saving, setSaving]     = useState(false)

  const save = async () => {
    setSaving(true)
    await fetch(`/api/client-companies/${company.id}/sla`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slaType: form.slaType, targetHours: Number(form.targetHours),
        actualHours: form.actualHours ? Number(form.actualHours) : null,
        met: form.met !== '' ? form.met === 'true' : null,
        note: form.note || null,
      }),
    })
    setSaving(false); setShowForm(false); onRefresh()
  }

  const records = company.slaRecords ?? []
  const met     = records.filter(r => r.met === true).length
  const missed  = records.filter(r => r.met === false).length
  const rate    = (met + missed) > 0 ? (met / (met + missed) * 100).toFixed(1) : null

  return (
    <div className="space-y-3">
      {records.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-2">
          <div className="text-center bg-green-50 dark:bg-green-900/10 rounded-lg p-2"><p className="text-lg font-bold text-green-600">{met}</p><p className="text-xs text-gray-500">ผ่าน SLA</p></div>
          <div className="text-center bg-red-50 dark:bg-red-900/10 rounded-lg p-2"><p className="text-lg font-bold text-red-600">{missed}</p><p className="text-xs text-gray-500">ไม่ผ่าน</p></div>
          <div className="text-center bg-blue-50 dark:bg-blue-900/10 rounded-lg p-2"><p className="text-lg font-bold text-blue-600">{rate != null ? `${rate}%` : '—'}</p><p className="text-xs text-gray-500">อัตราผ่าน</p></div>
        </div>
      )}
      <button onClick={() => setShowForm(!showForm)} className="w-full py-2 border-2 border-dashed border-purple-300 text-purple-600 rounded-lg text-sm hover:bg-purple-50 dark:hover:bg-purple-900/10">+ บันทึก SLA</button>
      {showForm && (
        <div className="bg-purple-50 dark:bg-purple-900/10 rounded-xl p-4 space-y-3 border border-purple-200 dark:border-purple-800">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">ประเภท SLA</label>
              <select value={form.slaType} onChange={e => setForm(p => ({...p, slaType: e.target.value}))} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                {SLA_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">เป้าหมาย (ชั่วโมง)</label>
              <input type="number" value={form.targetHours} onChange={e => setForm(p => ({...p, targetHours: e.target.value}))} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">เวลาจริง (ชั่วโมง)</label>
              <input type="number" value={form.actualHours} onChange={e => setForm(p => ({...p, actualHours: e.target.value}))} placeholder="(ถ้ามี)" className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ผล</label>
              <select value={form.met} onChange={e => setForm(p => ({...p, met: e.target.value}))} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <option value="">— ยังไม่ทราบ —</option>
                <option value="true">✅ ผ่าน</option>
                <option value="false">❌ ไม่ผ่าน</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
              <input value={form.note} onChange={e => setForm(p => ({...p, note: e.target.value}))} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="text-sm px-4 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50">{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          </div>
        </div>
      )}
      {records.length === 0 ? <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีบันทึก SLA</p> : records.map(r => (
        <div key={r.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium">{r.slaType}</p>
              <p className="text-xs text-gray-500">เป้า {r.targetHours}ชม.{r.actualHours != null ? ` · จริง ${r.actualHours}ชม.` : ''}</p>
              {r.note && <p className="text-xs text-gray-400">{r.note}</p>}
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ${r.met === true ? 'bg-green-100 text-green-700' : r.met === false ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
              {r.met === true ? '✅ ผ่าน' : r.met === false ? '❌ ไม่ผ่าน' : '—'}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ company }: { company: ClientCompany }) {
  const STATUS_TH: Record<string, string> = {
    NEW: 'รับเรื่อง', ASSIGNED: 'มอบหมาย', IN_PROGRESS: 'กำลังดำเนิน',
    WAITING_DOC: 'รอเอกสาร', WAITING_REVIEW: 'รอตรวจ', REVISION: 'แก้ไข',
    COMPLETED: 'เสร็จสิ้น', OVERDUE: 'เกินกำหนด', PENDING: 'รอดำเนิน',
  }
  const tasks = company.tasks ?? []
  return (
    <div className="space-y-2">
      {tasks.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-4">ไม่มีประวัติงาน (กรุณาลิงก์คดีกับลูกค้านี้ผ่านหน้ามอบหมายงาน)</p>
      ) : tasks.map(t => (
        <div key={t.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-sm">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="font-medium truncate">{t.title}</p>
              {t.caseNumber && <p className="text-xs text-gray-400 font-mono">{t.caseNumber}</p>}
              <p className="text-xs text-gray-400">ผู้รับผิดชอบ: {t.assignee.name}</p>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2 ${t.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{STATUS_TH[t.status] ?? t.status}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Revenue tab ──────────────────────────────────────────────────────────────

function RevenueTab({ company }: { company: ClientCompany }) {
  const rev = company._revenue
  const totalContractValue = (company.contracts ?? []).filter(c => c.status === 'ACTIVE').reduce((s, c) => s + c.value, 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">รายรับรวม</p>
          <p className="text-xl font-bold text-green-600">฿{fmt(rev?.income ?? 0)}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">ค่าใช้จ่ายรวม</p>
          <p className="text-xl font-bold text-red-600">฿{fmt(rev?.expense ?? 0)}</p>
        </div>
        <div className={`rounded-xl p-4 text-center ${(rev?.profit ?? 0) >= 0 ? 'bg-blue-50 dark:bg-blue-900/10' : 'bg-orange-50 dark:bg-orange-900/10'}`}>
          <p className="text-xs text-gray-500 mb-1">กำไรสุทธิ</p>
          <p className={`text-xl font-bold ${(rev?.profit ?? 0) >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>฿{fmt(rev?.profit ?? 0)}</p>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-600 p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">มูลค่าสัญญาที่มีผล</span><span className="font-medium">฿{fmt(totalContractValue)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">จำนวนคดี</span><span className="font-medium">{company._count?.tasks ?? company.tasks?.length ?? 0} คดี</span></div>
        <div className="flex justify-between"><span className="text-gray-500">รายรับเฉลี่ยต่อคดี</span>
          <span className="font-medium">
            {(company._count?.tasks ?? company.tasks?.length ?? 0) > 0
              ? `฿${fmt(Math.round((rev?.income ?? 0) / ((company._count?.tasks ?? company.tasks?.length ?? 1))))}`
              : '—'}
          </span>
        </div>
        <div className="flex justify-between"><span className="text-gray-500">จำนวนสัญญา</span><span className="font-medium">{company._count?.contracts ?? company.contracts?.length ?? 0} ฉบับ</span></div>
      </div>
      <p className="text-xs text-gray-400">* รายรับ/ค่าใช้จ่ายคำนวณจากข้อมูลในระบบการเงินคดี (Phase 7) ที่เชื่อมกับคดีของลูกค้านี้</p>
    </div>
  )
}

// ─── Files tab ────────────────────────────────────────────────────────────────

function FilesTab({ company, onRefresh }: { company: ClientCompany; onRefresh: () => void }) {
  const fileRef   = useRef<HTMLInputElement>(null)
  const [docType, setDocType]   = useState('สัญญา')
  const [uploading, setUploading] = useState(false)

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file); fd.append('docType', docType)
    await fetch(`/api/client-companies/${company.id}/files`, { method: 'POST', body: fd })
    setUploading(false); e.target.value = ''; onRefresh()
  }

  const del = async (fileId: string) => {
    if (!confirm('ลบไฟล์นี้?')) return
    await fetch(`/api/client-companies/${company.id}/files`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId }),
    })
    onRefresh()
  }

  const files = company.files ?? []
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select value={docType} onChange={e => setDocType(e.target.value)} className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300">
          {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex-1 py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
          {uploading ? 'กำลังอัพโหลด…' : '+ อัพโหลด'}
        </button>
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.zip" className="hidden" onChange={upload} />
      </div>
      {files.length === 0 ? <p className="text-center text-sm text-gray-400 py-4">ยังไม่มีไฟล์</p> : files.map(f => (
        <div key={f.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-sm">
          <div className="flex-1 min-w-0">
            <a href={f.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline truncate block">{f.filename}</a>
            <p className="text-xs text-gray-400">{f.docType} · {(f.size/1024).toFixed(1)} KB · {fmtDate(f.createdAt)}</p>
          </div>
          <button onClick={() => del(f.id)} className="ml-2 text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded">ลบ</button>
        </div>
      ))}
    </div>
  )
}

// ─── Create / Edit modal ──────────────────────────────────────────────────────

function CompanyModal({ mode, company, userId, onClose, onSave }: {
  mode: 'create'|'edit'; company?: ClientCompany; userId: string
  onClose: () => void; onSave: () => void
}) {
  const [form, setForm] = useState({
    companyName: company?.companyName ?? '', contactName: company?.contactName ?? '',
    phone:       company?.phone       ?? '', email:       company?.email       ?? '',
    lineId:      company?.lineId      ?? '', address:     company?.address     ?? '',
    taxId:       company?.taxId       ?? '', clientType:  company?.clientType  ?? 'CORPORATE',
    status:      company?.status      ?? 'ACTIVE',
    creditLimit: String(company?.creditLimit ?? ''),
    startDate:   company?.startDate ? company.startDate.slice(0, 10) : '',
    endDate:     company?.endDate   ? company.endDate.slice(0, 10)   : '',
    note:        company?.note ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({...f, [k]: v}))

  const save = async () => {
    if (!form.companyName) return
    setSaving(true)
    const url    = mode === 'create' ? '/api/client-companies'          : `/api/client-companies/${company!.id}`
    const method = mode === 'create' ? 'POST'                           : 'PATCH'
    const body   = { ...form, creditLimit: form.creditLimit ? Number(form.creditLimit) : null, startDate: form.startDate || null, endDate: form.endDate || null }
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (r.ok) onSave()
  }

  const fields = [
    { key: 'companyName', label: 'ชื่อบริษัท *',       placeholder: 'บริษัท ABC จำกัด', half: false },
    { key: 'contactName', label: 'ชื่อผู้ติดต่อ',        placeholder: 'คุณสมชาย',         half: true  },
    { key: 'phone',       label: 'เบอร์โทร',              placeholder: '02-xxx-xxxx',       half: true  },
    { key: 'email',       label: 'Email',                  placeholder: 'contact@corp.com',  half: true  },
    { key: 'lineId',      label: 'LINE ID',                placeholder: '@lineid',           half: true  },
    { key: 'taxId',       label: 'เลขประจำตัวผู้เสียภาษี', placeholder: '0105xxxxxxxxx',    half: true  },
    { key: 'creditLimit', label: 'วงเงินบริการ (บาท)',    placeholder: '0',                 half: true, type: 'number' },
    { key: 'startDate',   label: 'วันเริ่มสัญญา',         placeholder: '',                  half: true, type: 'date'   },
    { key: 'endDate',     label: 'วันหมดสัญญา',           placeholder: '',                  half: true, type: 'date'   },
    { key: 'address',     label: 'ที่อยู่',                placeholder: 'เลขที่ ถนน แขวง…',  half: false },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{mode === 'create' ? 'เพิ่มลูกค้าใหม่' : 'แก้ไขข้อมูลลูกค้า'}</h2>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            {fields.map(f => (
              <div key={f.key} className={f.half ? '' : 'col-span-2'}>
                <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                <input type={f.type ?? 'text'} value={form[f.key as keyof typeof form]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400" />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ประเภทลูกค้า</label>
              <select value={form.clientType} onChange={e => set('clientType', e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                {CLIENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">สถานะ</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                {CLIENT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
              <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none" placeholder="หมายเหตุ…" />
            </div>
          </div>
          <div className="p-6 pt-0 flex gap-3 justify-end">
            <button onClick={onClose} className="px-5 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm">ยกเลิก</button>
            <button onClick={save} disabled={saving || !form.companyName} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm disabled:opacity-50">{saving ? 'กำลังบันทึก…' : mode === 'create' ? 'เพิ่มลูกค้า' : 'บันทึก'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
