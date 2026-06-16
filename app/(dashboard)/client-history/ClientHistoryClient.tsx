'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Company {
  id: string; clientCode: string; companyName: string; contactName?: string
  phone?: string; status: string; clientType: string
  _count?: { contracts: number; tasks: number; slaRecords: number }
}

interface TaskItem {
  id: string; title: string; caseNumber?: string; status: string
  assignee: { id: string; name: string; department: string | null }
  updatedAt: string; createdAt: string
}

interface SlaItem {
  id: string; slaType: string; targetHours: number; actualHours?: number
  met?: boolean; note?: string; createdAt: string; resolvedAt?: string
  createdBy: { name: string }
}

interface ContractItem {
  id: string; contractNumber: string; serviceType: string; value: number
  startDate: string; endDate: string; status: string
}

interface CompanyDetail extends Company {
  contracts: ContractItem[]; tasks: TaskItem[]; slaRecords: SlaItem[]
  _revenue?: { income: number; expense: number; profit: number }
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700', INACTIVE: 'bg-gray-100 text-gray-600',
  SUSPENDED: 'bg-red-100 text-red-700', CONTRACT_EXPIRED: 'bg-orange-100 text-orange-700',
}
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'ใช้งาน', INACTIVE: 'ไม่ใช้งาน', SUSPENDED: 'ระงับ', CONTRACT_EXPIRED: 'สัญญาหมด',
}
const TASK_STATUS_TH: Record<string, string> = {
  NEW: 'รับเรื่อง', ASSIGNED: 'มอบหมาย', IN_PROGRESS: 'กำลังดำเนิน',
  WAITING_DOC: 'รอเอกสาร', WAITING_REVIEW: 'รอตรวจ', REVISION: 'แก้ไข',
  COMPLETED: 'เสร็จสิ้น', OVERDUE: 'เกินกำหนด', PENDING: 'รอดำเนิน',
}

const fmt     = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0 })
const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtDT   = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function ClientHistoryClient({ userId, userRole }: { userId: string; userRole: string }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [total,     setTotal]     = useState(0)
  const [q,         setQ]         = useState('')
  const [filterSt,  setFilterSt]  = useState('ACTIVE')
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<CompanyDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [activeTab, setActiveTab] = useState<'tasks'|'contracts'|'sla'|'summary'>('summary')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/client-companies?q=${encodeURIComponent(q)}&status=${filterSt}&page=1`)
    if (r.ok) { const d = await r.json(); setCompanies(d.items); setTotal(d.total) }
    setLoading(false)
  }, [q, filterSt])

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true)
    const r = await fetch(`/api/client-companies/${id}`)
    if (r.ok) setSelected(await r.json())
    setLoadingDetail(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ประวัติลูกค้า</h1>
          <p className="text-sm text-gray-500 mt-0.5">ประวัติการทำงาน สัญญา และ SLA ของลูกค้าองค์กร</p>
        </div>
        <Link href="/client-companies" className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50">← ลูกค้าองค์กร</Link>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: company list */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-3">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาบริษัท…" className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={filterSt} onChange={e => setFilterSt(e.target.value)} className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            <option value="">ทุกสถานะ</option>
            {['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CONTRACT_EXPIRED'].map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400">{total} บริษัท</p>
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {loading ? (
              <p className="text-center text-sm text-gray-400 py-6">กำลังโหลด…</p>
            ) : companies.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6">ไม่มีข้อมูล</p>
            ) : companies.map(c => (
              <button key={c.id} onClick={() => { loadDetail(c.id); setActiveTab('summary') }} className={`w-full text-left p-3 rounded-xl border transition-all ${selected?.id === c.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300'}`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 font-mono">{c.clientCode}</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.companyName}</p>
                    {c.contactName && <p className="text-xs text-gray-500">{c.contactName}</p>}
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1 ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  {c._count?.tasks ?? 0} คดี · {c._count?.contracts ?? 0} สัญญา · {c._count?.slaRecords ?? 0} SLA
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: detail */}
        <div className="flex-1 min-w-0">
          {loadingDetail ? (
            <div className="h-full flex items-center justify-center text-gray-400">กำลังโหลด…</div>
          ) : selected ? (
            <HistoryDetail company={selected} activeTab={activeTab} setActiveTab={setActiveTab} />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center"><div className="text-5xl mb-3">📋</div><p className="text-sm">เลือกบริษัทเพื่อดูประวัติ</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── History detail ───────────────────────────────────────────────────────────

function HistoryDetail({ company, activeTab, setActiveTab }: {
  company: CompanyDetail
  activeTab: 'tasks'|'contracts'|'sla'|'summary'
  setActiveTab: (t: 'tasks'|'contracts'|'sla'|'summary') => void
}) {
  const tabs = [
    { key: 'summary' as const,   label: 'สรุป' },
    { key: 'tasks' as const,     label: `คดี (${company.tasks?.length ?? 0})` },
    { key: 'contracts' as const, label: `สัญญา (${company.contracts?.length ?? 0})` },
    { key: 'sla' as const,       label: `SLA (${company.slaRecords?.length ?? 0})` },
  ]

  const met    = (company.slaRecords ?? []).filter(r => r.met === true).length
  const missed = (company.slaRecords ?? []).filter(r => r.met === false).length
  const slaRate = (met + missed) > 0 ? (met / (met + missed) * 100).toFixed(1) : null
  const completedTasks = (company.tasks ?? []).filter(t => t.status === 'COMPLETED').length
  const totalContracts = company.contracts ?? []
  const activeContracts = totalContracts.filter(c => c.status === 'ACTIVE')
  const totalContractValue = activeContracts.reduce((s, c) => s + c.value, 0)

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Company header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 font-mono">{company.clientCode}</p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{company.companyName}</h2>
            {company.contactName && <p className="text-sm text-gray-500">👤 {company.contactName}</p>}
            {company.phone && <p className="text-sm text-gray-500">📱 {company.phone}</p>}
          </div>
          <Link href="/client-companies" className="text-sm text-blue-600 hover:underline">แก้ไขข้อมูล →</Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 px-4 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className={`text-sm px-3 py-2.5 whitespace-nowrap border-b-2 transition-colors ${activeTab===t.key ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'summary' && (
          <div className="space-y-4">
            {/* KPI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'คดีทั้งหมด',        value: String(company.tasks?.length ?? 0),                color: 'text-blue-600' },
                { label: 'คดีเสร็จสิ้น',      value: String(completedTasks),                           color: 'text-green-600' },
                { label: 'สัญญามีผล',          value: String(activeContracts.length),                   color: 'text-purple-600' },
                { label: 'SLA ผ่าน',           value: slaRate != null ? `${slaRate}%` : '—',            color: Number(slaRate ?? 100) >= 80 ? 'text-green-600' : 'text-red-600' },
              ].map(k => (
                <div key={k.label} className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                  <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Revenue summary */}
            {company._revenue && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">รายรับรวม</p>
                  <p className="text-lg font-bold text-green-600">฿{fmt(company._revenue.income)}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">ค่าใช้จ่ายรวม</p>
                  <p className="text-lg font-bold text-red-600">฿{fmt(company._revenue.expense)}</p>
                </div>
                <div className={`rounded-xl p-3 text-center ${company._revenue.profit >= 0 ? 'bg-blue-50 dark:bg-blue-900/10' : 'bg-orange-50 dark:bg-orange-900/10'}`}>
                  <p className="text-xs text-gray-500 mb-1">กำไรสุทธิ</p>
                  <p className={`text-lg font-bold ${company._revenue.profit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>฿{fmt(company._revenue.profit)}</p>
                </div>
              </div>
            )}

            {/* Active contracts mini list */}
            {activeContracts.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">สัญญามีผล ({activeContracts.length} ฉบับ · มูลค่า ฿{fmt(totalContractValue)})</h3>
                <div className="space-y-1">
                  {activeContracts.map(c => (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{c.serviceType}</span>
                      <div className="text-right">
                        <p className="font-medium text-green-600">฿{fmt(c.value)}</p>
                        <p className="text-xs text-gray-400">หมด {fmtDate(c.endDate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent tasks */}
            {(company.tasks ?? []).length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">คดีล่าสุด</h3>
                <div className="space-y-2">
                  {(company.tasks ?? []).slice(0, 5).map(t => (
                    <div key={t.id} className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-gray-800 dark:text-gray-200">{t.title}</p>
                        {t.caseNumber && <p className="text-xs text-gray-400 font-mono">{t.caseNumber}</p>}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2 ${t.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{TASK_STATUS_TH[t.status] ?? t.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="space-y-2">
            {(company.tasks ?? []).length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6">ยังไม่มีประวัติงาน (ต้องลิงก์คดีกับลูกค้าก่อน)</p>
            ) : (company.tasks ?? []).map(t => (
              <div key={t.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-3 text-sm">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="font-medium truncate text-gray-900 dark:text-white">{t.title}</p>
                    {t.caseNumber && <p className="text-xs text-gray-400 font-mono">{t.caseNumber}</p>}
                    <p className="text-xs text-gray-500 mt-0.5">ผู้รับผิดชอบ: {t.assignee.name}{t.assignee.department ? ` · ${t.assignee.department}` : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : t.status === 'OVERDUE' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{TASK_STATUS_TH[t.status] ?? t.status}</span>
                    <p className="text-xs text-gray-400 mt-1">{fmtDate(t.updatedAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'contracts' && (
          <div className="space-y-2">
            {(company.contracts ?? []).length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6">ยังไม่มีสัญญา</p>
            ) : (company.contracts ?? []).map(c => {
              const CONTRACT_STATUS_COLORS: Record<string, string> = {
                ACTIVE: 'bg-green-100 text-green-700', EXPIRED: 'bg-red-100 text-red-700',
                TERMINATED: 'bg-gray-100 text-gray-600', PENDING: 'bg-yellow-100 text-yellow-700',
              }
              const CONTRACT_STATUS_LABELS: Record<string, string> = {
                ACTIVE: 'มีผล', EXPIRED: 'หมดอายุ', TERMINATED: 'ยกเลิก', PENDING: 'รออนุมัติ',
              }
              return (
                <div key={c.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-3 text-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-xs text-gray-400">{c.contractNumber}</p>
                      <p className="font-medium text-gray-900 dark:text-white">{c.serviceType}</p>
                      <p className="text-xs text-gray-500">{fmtDate(c.startDate)} — {fmtDate(c.endDate)}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${CONTRACT_STATUS_COLORS[c.status]}`}>{CONTRACT_STATUS_LABELS[c.status]}</span>
                      <p className="text-sm font-semibold text-green-600 mt-1">฿{fmt(c.value)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {activeTab === 'sla' && (
          <div className="space-y-2">
            {(company.slaRecords ?? []).length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6">ยังไม่มีบันทึก SLA</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3 text-center"><p className="text-lg font-bold text-green-600">{met}</p><p className="text-xs text-gray-500">ผ่าน</p></div>
                  <div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-3 text-center"><p className="text-lg font-bold text-red-600">{missed}</p><p className="text-xs text-gray-500">ไม่ผ่าน</p></div>
                  <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3 text-center"><p className="text-lg font-bold text-blue-600">{slaRate != null ? `${slaRate}%` : '—'}</p><p className="text-xs text-gray-500">อัตราผ่าน</p></div>
                </div>
                {(company.slaRecords ?? []).map(r => (
                  <div key={r.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{r.slaType}</p>
                        <p className="text-xs text-gray-500">เป้า {r.targetHours}ชม.{r.actualHours != null ? ` · จริง ${r.actualHours}ชม.` : ''}</p>
                        <p className="text-xs text-gray-400">{fmtDT(r.createdAt)}{r.resolvedAt ? ` → ${fmtDT(r.resolvedAt)}` : ''}</p>
                        {r.note && <p className="text-xs text-gray-400">{r.note}</p>}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ml-2 ${r.met === true ? 'bg-green-100 text-green-700' : r.met === false ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.met === true ? '✅ ผ่าน' : r.met === false ? '❌ ไม่ผ่าน' : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
