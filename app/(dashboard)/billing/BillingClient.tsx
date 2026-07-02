'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Company { id: string; clientCode: string; companyName: string }
interface InvoiceRow {
  id: string; invoiceNumber: string; clientName: string; serviceType: string
  totalAmount: number; remainingAmount: number; paidAmount: number
  status: string; dueDate: string; issueDate: string
  clientCompany?: Company
}
interface Summary {
  totalInvoices: number
  statusMap: Record<string, { count: number; total: number }>
  monthRevenue: number; monthPaidCount: number
  totalOutstanding: number; overdueCount: number
  overdueList: (InvoiceRow & { clientCompany?: Company })[]
  recentInvoices: (InvoiceRow & { clientCompany?: Company })[]
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', SENT: 'bg-green-100 text-green-700',
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-700', PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-400',
}
const STATUS_TH: Record<string, string> = {
  DRAFT: 'แบบร่าง', SENT: 'ส่งแล้ว', PENDING_PAYMENT: 'รอชำระ',
  PAID: 'ชำระแล้ว', OVERDUE: 'เกินกำหนด', CANCELLED: 'ยกเลิก',
}

const fmt     = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0 })
const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
const daysLeft = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000)

const FINANCE_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export default function BillingClient({ userId, userRole }: { userId: string; userRole: string }) {
  const canManage  = FINANCE_ROLES.includes(userRole)
  const [summary,  setSummary]  = useState<Summary | null>(null)
  const [tab,      setTab]      = useState<'dashboard'|'outstanding'>('dashboard')
  const [overdue,  setOverdue]  = useState<InvoiceRow[]>([])
  const [loadingO, setLoadingO] = useState(false)

  const loadSummary = useCallback(async () => {
    if (!canManage) return
    const r = await fetch('/api/invoices/summary')
    if (r.ok) setSummary(await r.json())
  }, [canManage])

  const loadOverdue = useCallback(async () => {
    setLoadingO(true)
    const r = await fetch('/api/invoices?overdue=true&page=1')
    if (r.ok) { const d = await r.json(); setOverdue(d.items) }
    setLoadingO(false)
  }, [])

  useEffect(() => { loadSummary(); loadOverdue() }, [loadSummary, loadOverdue])

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">วางบิล / การเงินลูกค้า</h1>
          <p className="text-sm text-gray-500 mt-0.5">Billing & Revenue Overview</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {['dashboard', 'outstanding'].map(t => (
            <button key={t} onClick={() => setTab(t as 'dashboard'|'outstanding')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab===t ? 'bg-green-600 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
              {t === 'dashboard' ? 'Dashboard' : `ค้างชำระ (${overdue.length})`}
            </button>
          ))}
          <Link href="/invoices" className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50">ใบแจ้งหนี้ →</Link>
        </div>
      </div>

      {tab === 'dashboard' && summary && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'รายรับเดือนนี้',     value: `฿${fmt(summary.monthRevenue)}`,     color: 'text-green-600',  bg: 'bg-green-50 dark:bg-green-900/10' },
              { label: 'ยอดค้างชำระรวม',    value: `฿${fmt(summary.totalOutstanding)}`, color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/10' },
              { label: 'ใบแจ้งหนี้ทั้งหมด', value: summary.totalInvoices.toLocaleString(), color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/10' },
              { label: 'เกินกำหนดชำระ',     value: summary.overdueCount.toLocaleString(), color: summary.overdueCount > 0 ? 'text-red-600' : 'text-gray-500', bg: summary.overdueCount > 0 ? 'bg-red-50 dark:bg-red-900/10' : 'bg-gray-50 dark:bg-gray-700/30' },
            ].map(c => (
              <div key={c.label} className={`${c.bg} rounded-xl p-4`}>
                <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Status breakdown */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">สถานะใบแจ้งหนี้</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {['DRAFT','SENT','PENDING_PAYMENT','PAID','OVERDUE','CANCELLED'].map(s => {
                const d = summary.statusMap[s] ?? { count: 0, total: 0 }
                return (
                  <div key={s} className={`rounded-lg p-3 ${STATUS_COLORS[s]}`}>
                    <p className="text-xs font-medium">{STATUS_TH[s]}</p>
                    <p className="text-lg font-bold">{d.count}</p>
                    <p className="text-xs opacity-70">฿{fmt(d.total)}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent + Overdue side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">ใบแจ้งหนี้ล่าสุด</h3>
              <div className="space-y-2">
                {summary.recentInvoices.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">ไม่มีข้อมูล</p> : summary.recentInvoices.map(inv => (
                  <Link key={inv.id} href="/invoices" className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-gray-400">{inv.invoiceNumber}</p>
                      <p className="text-sm font-medium truncate">{inv.clientName}</p>
                    </div>
                    <div className="text-right ml-2 flex-shrink-0">
                      <span className={`text-[12px] px-1.5 py-0.5 rounded-full block mb-0.5 ${STATUS_COLORS[inv.status]}`}>{STATUS_TH[inv.status]}</span>
                      <p className="text-xs font-semibold">฿{fmt(inv.totalAmount)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Overdue */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-red-600 mb-3">⚠️ เกินกำหนดชำระ ({summary.overdueList.length})</h3>
              <div className="space-y-2">
                {summary.overdueList.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">ไม่มีรายการค้างชำระ 🎉</p> : summary.overdueList.map(inv => {
                  const days = Math.abs(daysLeft(inv.dueDate))
                  return (
                    <Link key={inv.id} href="/invoices" className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors">
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-gray-400">{inv.invoiceNumber}</p>
                        <p className="text-sm font-medium truncate">{inv.clientName}</p>
                        <p className="text-xs text-red-500">เกิน {days} วัน</p>
                      </div>
                      <div className="text-right ml-2 flex-shrink-0">
                        <p className="text-sm font-bold text-red-600">฿{fmt(inv.remainingAmount)}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'outstanding' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loadingO ? (
            <p className="text-center text-sm text-gray-400 py-12">กำลังโหลด…</p>
          ) : overdue.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">ไม่มีรายการค้างชำระ 🎉</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
                    {['เลขใบแจ้งหนี้', 'ลูกค้า', 'ยอดค้าง', 'ครบกำหนด', 'เกินกำหนด (วัน)', 'สถานะ', ''].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {overdue.map(inv => {
                    const days = Math.abs(daysLeft(inv.dueDate))
                    return (
                      <tr key={inv.id} className="hover:bg-red-50 dark:hover:bg-red-900/5 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-gray-500">{inv.invoiceNumber}</td>
                        <td className="py-3 px-4">
                          <p className="font-medium">{inv.clientName}</p>
                          {inv.clientCompany && <p className="text-xs text-gray-400">{inv.clientCompany.clientCode}</p>}
                        </td>
                        <td className="py-3 px-4 font-bold text-red-600">฿{fmt(inv.remainingAmount)}</td>
                        <td className="py-3 px-4 text-red-600">{fmtDate(inv.dueDate)}</td>
                        <td className="py-3 px-4">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${days > 60 ? 'bg-red-200 text-red-800' : days > 30 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{days} วัน</span>
                        </td>
                        <td className="py-3 px-4"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[inv.status]}`}>{STATUS_TH[inv.status]}</span></td>
                        <td className="py-3 px-4"><Link href="/invoices" className="text-xs text-green-600 hover:underline">ดูรายละเอียด</Link></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
