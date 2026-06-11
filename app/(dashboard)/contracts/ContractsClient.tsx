'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Company { id: string; clientCode: string; companyName: string; phone?: string }
interface Contract {
  id: string; contractNumber: string; serviceType: string
  startDate: string; endDate: string; value: number
  slaAgreement?: string; paymentTerms?: string; status: string; note?: string
  clientCompany: Company
  createdBy: { id: string; name: string; role: string; department: string | null }
  _count: { files: number; slaRecords: number }
}

const CONTRACT_STATUSES = ['ACTIVE', 'EXPIRED', 'TERMINATED', 'PENDING']
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700', EXPIRED: 'bg-red-100 text-red-700',
  TERMINATED: 'bg-gray-100 text-gray-600', PENDING: 'bg-yellow-100 text-yellow-700',
}
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'มีผล', EXPIRED: 'หมดอายุ', TERMINATED: 'ยกเลิก', PENDING: 'รออนุมัติ',
}

const fmt     = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0 })
const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
const daysLeft = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000)

export default function ContractsClient({ userId, userRole }: { userId: string; userRole: string }) {
  const [contracts,  setContracts]  = useState<Contract[]>([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [q,          setQ]          = useState('')
  const [filterSt,   setFilterSt]   = useState('')
  const [expiring,   setExpiring]   = useState(false)
  const [loading,    setLoading]    = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/contracts?q=${encodeURIComponent(q)}&status=${filterSt}&expiring=${expiring}&page=${page}`)
    if (r.ok) { const d = await r.json(); setContracts(d.items); setTotal(d.total) }
    setLoading(false)
  }, [q, filterSt, expiring, page])

  useEffect(() => { load() }, [load])

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/contracts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    load()
  }

  const del = async (id: string) => {
    if (!confirm('ลบสัญญานี้?')) return
    await fetch(`/api/contracts/${id}`, { method: 'DELETE' })
    load()
  }

  const canDelete = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR'].includes(userRole)
  const pages     = Math.ceil(total / 50)

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">สัญญา</h1>
          <p className="text-sm text-gray-500 mt-0.5">รายการสัญญาทั้งหมด ({total.toLocaleString()} ฉบับ)</p>
        </div>
        <Link href="/client-companies" className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50">← ลูกค้าองค์กร</Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="ค้นหาสัญญา / บริษัท…" className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-60" />
        <select value={filterSt} onChange={e => { setFilterSt(e.target.value); setPage(1) }} className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          <option value="">ทุกสถานะ</option>
          {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <button onClick={() => { setExpiring(!expiring); setPage(1) }} className={`text-sm px-4 py-2 rounded-lg border transition-colors ${expiring ? 'bg-orange-100 border-orange-300 text-orange-700 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
          ⚠️ หมดอายุใน 90 วัน
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <p className="text-center text-sm text-gray-400 py-12">กำลังโหลด…</p>
        ) : contracts.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-12">ไม่พบสัญญา</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
                  {['เลขที่สัญญา', 'บริษัท', 'ประเภทบริการ', 'มูลค่า', 'วันหมดอายุ', 'สถานะ', ''].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {contracts.map(c => {
                  const days    = daysLeft(c.endDate)
                  const expWarn = c.status === 'ACTIVE' && days >= 0 && days <= 30
                  const expYell = c.status === 'ACTIVE' && days >= 0 && days <= 90 && days > 30
                  return (
                    <tr key={c.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${expWarn ? 'bg-red-50 dark:bg-red-900/5' : expYell ? 'bg-yellow-50 dark:bg-yellow-900/5' : ''}`}>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{c.contractNumber}</span>
                        {c.slaAgreement && <p className="text-[10px] text-blue-500 mt-0.5">{c.slaAgreement}</p>}
                      </td>
                      <td className="py-3 px-4">
                        <Link href={`/client-companies`} className="font-medium text-blue-600 hover:underline">{c.clientCompany.companyName}</Link>
                        <p className="text-xs text-gray-400 font-mono">{c.clientCompany.clientCode}</p>
                      </td>
                      <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{c.serviceType}</td>
                      <td className="py-3 px-4 font-semibold text-green-600">฿{fmt(c.value)}</td>
                      <td className="py-3 px-4">
                        <p>{fmtDate(c.endDate)}</p>
                        {c.status === 'ACTIVE' && (
                          <p className={`text-xs font-medium ${days < 0 ? 'text-red-600' : expWarn ? 'text-orange-600' : expYell ? 'text-yellow-600' : 'text-gray-400'}`}>
                            {days < 0 ? `เกิน ${Math.abs(days)}ว.` : `เหลือ ${days}ว.`}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          {c.status === 'ACTIVE' && (
                            <button onClick={() => updateStatus(c.id, 'EXPIRED')} className="text-[10px] px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 rounded">หมดอายุ</button>
                          )}
                          {c.status === 'ACTIVE' && (
                            <button onClick={() => updateStatus(c.id, 'TERMINATED')} className="text-[10px] px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded">ยกเลิก</button>
                          )}
                          {canDelete && (
                            <button onClick={() => del(c.id)} className="text-[10px] px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-500 rounded">ลบ</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">‹ ก่อนหน้า</button>
          <span className="text-gray-500">หน้า {page} / {pages}</span>
          <button onClick={() => setPage(p => p+1)} disabled={page>=pages} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">ถัดไป ›</button>
        </div>
      )}
    </div>
  )
}
